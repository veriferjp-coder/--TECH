
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const webpmux = require('node-webpmux');

const exec = promisify(execFile);

const COMMANDS = [
  'sticker', 's', 'take', 'toimg', 'tovideo',
  'emojimix', 'attp', 'ttp', 'circle', 'crop'
];

const MAX_SIZE = 15 * 1024 * 1024;

function getMedia(msg) {
  const message = msg.message || {};
  const context = message.extendedTextMessage?.contextInfo;

  if (message.imageMessage || message.videoMessage) {
    return { message, key: msg.key };
  }

  if (message.stickerMessage) {
    return { message, key: msg.key };
  }

  if (context?.quotedMessage) {
    return {
      message: context.quotedMessage,
      key: {
        remoteJid: msg.key.remoteJid,
        id: context.stanzaId,
        participant: context.participant,
        fromMe: false
      }
    };
  }

  return null;
}

async function downloadMedia(msg) {
  const source = getMedia(msg);

  if (!source) {
    throw new Error('Send or reply to an image, video, or sticker.');
  }

  const buffer = await downloadMediaMessage(
    source,
    'buffer',
    {},
    { logger: console }
  );

  if (!buffer || buffer.length > MAX_SIZE) {
    throw new Error('Media is empty or exceeds the 15 MB limit.');
  }

  return {
    buffer,
    message: source.message
  };
}

async function sendSticker(sock, jid, buffer, quoted, pack, author) {
  let output = buffer;

  try {
    const image = await webpmux.Image.load(buffer);

    const json = Buffer.from(JSON.stringify({
      'sticker-pack-id': 'simon-tech-bot',
      'sticker-pack-name': pack || 'SIMON TECH BOT',
      'sticker-pack-publisher': author || 'SIMON TECH',
      emojis: []
    }));

    const exif = Buffer.concat([
      Buffer.from([
        0x49, 0x49, 0x2A, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
      ]),
      json
    ]);

    exif.writeUIntLE(json.length, 14, 4);
    image.exif = exif;
    output = await image.save(null);
  } catch (error) {
    console.log('[STICKER METADATA]', error.message);
  }

  return sock.sendMessage(
    jid,
    { sticker: output },
    { quoted }
  );
}

async function createTextSticker(text, animated = false) {
  const safeText = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 80);

  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="50" fill="#202020"/>
      <text x="256" y="256"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="48"
        font-weight="bold"
        fill="white"
        font-family="sans-serif">${safeText}</text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .resize(512, 512, { fit: 'contain' })
    .webp()
    .toBuffer();
}

async function videoToWebp(buffer) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'simon-sticker-'));

  try {
    const input = path.join(folder, 'input.mp4');
    const output = path.join(folder, 'output.webp');

    fs.writeFileSync(input, buffer);

    await exec('ffmpeg', [
      '-y',
      '-i', input,
      '-t', '8',
      '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-loop', '0',
      '-preset', 'default',
      '-an',
      output
    ]);

    return fs.readFileSync(output);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function webpToVideo(buffer) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'simon-video-'));

  try {
    const input = path.join(folder, 'input.webp');
    const output = path.join(folder, 'output.mp4');

    fs.writeFileSync(input, buffer);

    await exec('ffmpeg', [
      '-y',
      '-i', input,
      '-movflags', 'faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      output
    ]);

    return fs.readFileSync(output);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

module.exports = {
  name: 'sticker',
  aliases: COMMANDS.slice(1),
  category: 'sticker',
  description: '10 sticker creation and conversion commands',

  async execute(sock, msg, args, context) {
    const command = context.command;
    const jid = context.jid;
    const value = args.join(' ').trim();

    const reply = text => sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    );

    try {
      switch (command) {

        case 'sticker':
        case 's': {
          const { buffer, message } = await downloadMedia(msg);

          if (message.videoMessage) {
            const sticker = await videoToWebp(buffer);
            return sendSticker(sock, jid, sticker, msg);
          }

          if (!message.imageMessage && !message.stickerMessage) {
            return reply('❌ Use an image or video for this command.');
          }

          const sticker = await sharp(buffer)
            .rotate()
            .resize(512, 512, {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality: 85 })
            .toBuffer();

          return sendSticker(sock, jid, sticker, msg);
        }

        case 'take': {
          const { buffer } = await downloadMedia(msg);
          const [pack, ...authorParts] = value.split('|');

          if (!pack || !authorParts.join('|').trim()) {
            return reply('Usage: .take Pack Name | Author Name');
          }

          const author = authorParts.join('|').trim();

          return sendSticker(
            sock,
            jid,
            buffer,
            msg,
            pack.trim(),
            author
          );
        }

        case 'toimg': {
          const { buffer, message } = await downloadMedia(msg);

          if (!message.stickerMessage) {
            return reply('❌ Reply to a sticker with .toimg.');
          }

          const image = await sharp(buffer)
            .png()
            .toBuffer();

          return sock.sendMessage(jid, {
            image,
            caption: '✅ Sticker converted to image.'
          }, { quoted: msg });
        }

        case 'tovideo': {
          const { buffer, message } = await downloadMedia(msg);

          if (!message.stickerMessage) {
            return reply('❌ Reply to an animated sticker with .tovideo.');
          }

          const video = await webpToVideo(buffer);

          return sock.sendMessage(jid, {
            video,
            mimetype: 'video/mp4',
            caption: '✅ Sticker converted to video.'
          }, { quoted: msg });
        }

        case 'emojimix': {
          const emojis = value.split('+').map(x => x.trim());

          if (emojis.length !== 2 || !emojis[0] || !emojis[1]) {
            return reply('Usage: .emojimix 😀+🔥');
          }

          const svg = `
            <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
              <rect width="512" height="512" rx="60" fill="#ffffff"/>
              <text x="256" y="230" text-anchor="middle" font-size="160">${emojis[0]}</text>
              <text x="256" y="400" text-anchor="middle" font-size="160">${emojis[1]}</text>
            </svg>
          `;

          const image = await sharp(Buffer.from(svg))
            .png()
            .toBuffer();

          const sticker = await sharp(image)
            .resize(512, 512)
            .webp()
            .toBuffer();

          return sendSticker(sock, jid, sticker, msg);
        }

        case 'ttp':
        case 'attp': {
          if (!value) {
            return reply(`Usage: .${command} Your text`);
          }

          const sticker = await createTextSticker(value);

          return sendSticker(sock, jid, sticker, msg);
        }

        case 'circle': {
          const { buffer } = await downloadMedia(msg);

          const image = await sharp(buffer)
            .resize(512, 512, { fit: 'cover' })
            .composite([{
              input: Buffer.from(`
                <svg width="512" height="512">
                  <circle cx="256" cy="256" r="252" fill="white"/>
                </svg>
              `),
              blend: 'dest-in'
            }])
            .webp()
            .toBuffer();

          return sendSticker(sock, jid, image, msg);
        }

        case 'crop': {
          const { buffer } = await downloadMedia(msg);

          const image = await sharp(buffer)
            .rotate()
            .resize(512, 512, { fit: 'cover', position: 'centre' })
            .webp({ quality: 85 })
            .toBuffer();

          return sendSticker(sock, jid, image, msg);
        }

        default:
          return reply('❌ Unknown sticker command.');
      }
    } catch (error) {
      console.error(`[STICKER: ${command}]`, error);

      return reply(
        `❌ Sticker command failed: ${error.message || 'Check media and dependencies.'}`
      );
    }
  }
};
      
