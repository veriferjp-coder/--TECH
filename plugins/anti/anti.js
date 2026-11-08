
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../../database');
const DB_FILE = path.join(DB_DIR, 'anti.json');

const COMMANDS = [
  'antilink', 'antispam', 'antibot', 'antifake',
  'antidelete', 'antiflood', 'antiraid', 'antitoxic',
  'antitag', 'antimention', 'antibadword', 'anticall',
  'antivv', 'antiedit', 'antiporn', 'antigroup',
  'antichannel', 'antiscam', 'antiphishing', 'antivirus',
  'antiforward', 'antisticker', 'antiaudio', 'antimedia',
  'antiimage', 'antivideo', 'antidocument', 'antipoll',
  'antibug', 'antidevice'
];

const DEFAULT_WORDS = [
  'idiot', 'stupid', 'fool', 'useless'
];

const URL_REGEX = /https?:\/\/|www\./i;
const GROUP_LINK = /chat\.whatsapp\.com\/[A-Za-z0-9]+/i;
const CHANNEL_LINK = /whatsapp\.com\/channel\//i;

const spamCache = new Map();
const floodCache = new Map();
const raidCache = new Map();
const messageCache = new Map();

function ensureDB() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '{}');
  }
}

function readDB() {
  ensureDB();

  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeDB(data) {
  ensureDB();

  const temp = DB_FILE + '.tmp';

  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DB_FILE);
}

function getSettings(jid) {
  const db = readDB();
  return db[jid] || {};
}

function enabled(jid, name) {
  return getSettings(jid)[name] === true;
}

function isGroup(jid) {
  return jid && jid.endsWith('@g.us');
}

function getBody(msg) {
  const m = msg.message || {};

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

function getMessageType(msg) {
  const m = msg.message || {};
  return Object.keys(m)[0] || '';
}

function getSender(msg) {
  return msg.key.participant || msg.key.remoteJid;
}

function isAdmin(metadata, jid) {
  const member = metadata.participants.find(
    p => p.id === jid
  );

  return member?.admin === 'admin' ||
    member?.admin === 'superadmin';
}

function isBotAdmin(metadata, sock) {
  const bot = metadata.participants.find(
    p => p.id === sock.user?.id
  );

  return bot?.admin === 'admin' ||
    bot?.admin === 'superadmin';
}

async function removeMessage(sock, msg) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      delete: msg.key
    });

    return true;
  } catch (error) {
    console.error('[ANTI DELETE]', error.message);
    return false;
  }
}

async function warn(sock, jid, text, msg) {
  return sock.sendMessage(
    jid,
    { text },
    msg ? { quoted: msg } : {}
  );
}

async function enforce(sock, msg, reason) {
  const jid = msg.key.remoteJid;

  try {
    const metadata = await sock.groupMetadata(jid);

    if (!isBotAdmin(metadata, sock)) {
      await warn(
        sock,
        jid,
        `⚠️ ${reason}\nBot needs group admin permission to remove messages.`,
        msg
      );

      return false;
    }

    await removeMessage(sock, msg);

    await warn(
      sock,
      jid,
      `🛡️ SIMON TECH ANTI\n\n` +
      `Reason: ${reason}\n` +
      `User: @${getSender(msg).split('@')[0]}`,
      null
    );

    return true;
  } catch (error) {
    console.error('[ANTI ENFORCEMENT]', error.message);
    return false;
  }
}

function containsLink(text) {
  return URL_REGEX.test(text);
}

function getMime(msg) {
  const m = msg.message || {};

  return (
    m.documentMessage?.mimetype ||
    m.imageMessage?.mimetype ||
    m.videoMessage?.mimetype ||
    m.audioMessage?.mimetype ||
    ''
  ).toLowerCase();
}

function getMediaType(msg) {
  const type = getMessageType(msg);

  if (type.includes('image')) return 'image';
  if (type.includes('video')) return 'video';
  if (type.includes('audio')) return 'audio';
  if (type.includes('document')) return 'document';
  if (type.includes('sticker')) return 'sticker';
  if (type.includes('poll')) return 'poll';

  return null;
}

function hasViewOnce(msg) {
  const m = msg.message || {};

  return Boolean(
    m.viewOnceMessage ||
    m.viewOnceMessageV2 ||
    m.viewOnceMessageV2Extension
  );
}

function hasForwardTag(msg) {
  const m = msg.message || {};
  const context = m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo;

  return Boolean(context?.isForwarded);
}

function isSuspiciousFile(msg) {
  const mime = getMime(msg);

  const blocked = [
    'application/x-msdownload',
    'application/x-executable',
    'application/x-dosexec',
    'application/x-sh',
    'application/x-bat',
    'application/vnd.android.package-archive'
  ];

  return blocked.some(type => mime.includes(type));
}

function hasMassMention(msg) {
  const m = msg.message || {};

  const context =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo;

  return (context?.mentionedJid || []).length;
}

function cleanText(text) {
  return String(text || '').toLowerCase();
}

function checkWords(text, words) {
  const normalized = cleanText(text);

  return words.some(word =>
    new RegExp(
      `(^|\\W)${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`,
      'i'
    ).test(normalized)
  );
}

function isRepeated(jid, sender, body) {
  const key = `${jid}:${sender}`;
  const now = Date.now();

  const previous = spamCache.get(key);

  if (
    previous &&
    previous.body === body &&
    now - previous.time < 10000
  ) {
    previous.count++;
    previous.time = now;
    spamCache.set(key, previous);

    return previous.count >= 3;
  }

  spamCache.set(key, {
    body,
    count: 1,
    time: now
  });

  return false;
}

function isFlooding(jid, sender) {
  const key = `${jid}:${sender}`;
  const now = Date.now();

  const times = (floodCache.get(key) || [])
    .filter(time => now - time < 5000);

  times.push(now);
  floodCache.set(key, times);

  return times.length >= 7;
}

async function handleMessage(sock, msg) {
  if (!msg?.key || !msg.message) return;

  const jid = msg.key.remoteJid;

  if (!isGroup(jid) || msg.key.fromMe) return;

  const sender = getSender(msg);
  const body = getBody(msg);
  const type = getMessageType(msg);
  const settings = getSettings(jid);

  // Save messages for delete/edit logging.
  if (settings.antidelete || settings.antiedit) {
    const id = msg.key.id;

    if (id) {
      messageCache.set(`${jid}:${id}`, {
        sender,
        body,
        type,
        time: Date.now()
      });

      if (messageCache.size > 2000) {
        const oldest = messageCache.keys().next().value;
        messageCache.delete(oldest);
      }
    }
  }

  // Ignore administrators for ordinary content protections.
  let metadata;

  try {
    metadata = await sock.groupMetadata(jid);
  } catch {
    return;
  }

  if (isAdmin(metadata, sender)) return;

  // Anti malformed messages.
  if (settings.antibug) {
    const serialized = JSON.stringify(msg.message);

    if (
      serialized.length > 100000 ||
      Object.keys(msg.message).length > 30
    ) {
      return enforce(sock, msg, 'Malformed or oversized message');
    }
  }

  // Anti links.
  if (
    body &&
    containsLink(body) &&
    (
      settings.antilink ||
      settings.antigroup ||
      settings.antichannel ||
      settings.antiscam ||
      settings.antiphishing ||
      settings.antiporn
    )
  ) {
    if (settings.antigroup && GROUP_LINK.test(body)) {
      return enforce(sock, msg, 'WhatsApp group links are prohibited');
    }

    if (settings.antichannel && CHANNEL_LINK.test(body)) {
      return enforce(sock, msg, 'WhatsApp channel links are prohibited');
    }

    if (settings.antiporn && /porn|xxx|adult/i.test(body)) {
      return enforce(sock, msg, 'Inappropriate link detected');
    }

    if (
      settings.antiscam &&
      /(free\s+money|claim\s+prize|giveaway|investment\s+guarantee)/i.test(body)
    ) {
      return enforce(sock, msg, 'Potential scam message detected');
    }

    if (
      settings.antiphishing &&
      /(verify.{0,20}account|password.{0,20}here|login.{0,20}now)/i.test(body)
    ) {
      return enforce(sock, msg, 'Potential phishing message detected');
    }

    if (
      settings.antilink &&
      !GROUP_LINK.test(body) &&
      !CHANNEL_LINK.test(body)
    ) {
      return enforce(sock, msg, 'External links are prohibited');
    }
  }

  // Anti spam.
  if (settings.antispam && body) {
    if (isRepeated(jid, sender, body)) {
      return enforce(sock, msg, 'Repeated messages detected');
    }
  }

  // Anti flood.
  if (settings.antiflood && isFlooding(jid, sender)) {
    return enforce(sock, msg, 'Message flooding detected');
  }

  // Anti toxic and bad words.
  const words = settings.words || DEFAULT_WORDS;

  if (
    body &&
    (
      (settings.antitoxic && checkWords(body, words)) ||
      (settings.antibadword && checkWords(body, words))
    )
  ) {
    return enforce(sock, msg, 'Prohibited language detected');
  }

  // Anti mass tagging.
  const mentions = hasMassMention(msg);

  if (
    settings.antitag &&
    mentions >= 5
  ) {
    return enforce(sock, msg, 'Mass tagging is prohibited');
  }

  if (
    settings.antimention &&
    mentions > 0
  ) {
    return enforce(sock, msg, 'Mentions are prohibited');
  }

  // Anti forwarded messages.
  if (settings.antiforward && hasForwardTag(msg)) {
    return enforce(sock, msg, 'Forwarded messages are prohibited');
  }

  // Anti view once.
  if (settings.antivv && hasViewOnce(msg)) {
    return enforce(sock, msg, 'View-once messages are prohibited');
  }

  // Anti media restrictions.
  const media = getMediaType(msg);

  if (media) {
    if (settings.antimedia) {
      return enforce(sock, msg, 'Media messages are prohibited');
    }

    const map = {
      sticker: 'antisticker',
      audio: 'antiaudio',
      image: 'antiimage',
      video: 'antivideo',
      document: 'antidocument',
      poll: 'antipoll'
    };

    if (map[media] && settings[map[media]]) {
      return enforce(sock, msg, `${media} messages are prohibited`);
    }
  }

  // Anti suspicious file types.
  if (settings.antivirus && isSuspiciousFile(msg)) {
    return enforce(sock, msg, 'Suspicious file type detected');
  }

  // Anti bot: detect configured known automation accounts.
  if (settings.antibot) {
    const blockedBots = settings.blockedBots || [];

    if (blockedBots.includes(sender)) {
      return enforce(sock, msg, 'Blocked automation account');
    }
  }

  // Anti fake number prefixes.
  if (settings.antifake) {
    const number = sender.split('@')[0].replace(/\D/g, '');
    const allowed = settings.allowedPrefixes || [];

    if (
      allowed.length &&
      !allowed.some(prefix => number.startsWith(prefix))
    ) {
      return enforce(sock, msg, 'Number prefix is not allowed');
    }
  }

  // Anti device: flag unusual device JID formats for admin review.
  if (settings.antidevice && sender.includes(':')) {
    await warn(
      sock,
      jid,
      `⚠️ Device-related sender identifier detected: ${sender.split('@')[0]}`,
      msg
    );
  }
}

async function handleGroupUpdate(sock, update) {
  const jid = update.id;

  if (!isGroup(jid) || !enabled(jid, 'antiraid')) return;

  const now = Date.now();
  const key = jid;

  const recent = (raidCache.get(key) || [])
    .filter(time => now - time < 10000);

  for (const participant of update.participants || []) {
    if (update.action === 'add') recent.push(now);
  }

  raidCache.set(key, recent);

  if (recent.length >= 5) {
    await warn(
      sock,
      jid,
      '🚨 ANTI-RAID ALERT\nMultiple users joined in a short period. Admins should review the group.'
    );
  }
}

async function handleCall(sock, call) {
  if (!call || !call.from) return;

  const db = readDB();

  // Call protection is per session's personal settings.
  const personal = db[`calls:${sock.user?.id}`] || {};

  if (!personal.anticall) return;

  try {
    if (typeof sock.rejectCall === 'function') {
      await sock.rejectCall(call.id, call.from);
    }
  } catch (error) {
    console.error('[ANTI CALL]', error.message);
  }
}

async function handleMessageUpdate(sock, update) {
  const key = update.key;

  if (!key?.remoteJid || !key?.id) return;

  const jid = key.remoteJid;
  const cached = messageCache.get(`${jid}:${key.id}`);

  if (!cached) return;

  const protocol = update.update?.message;

  if (!protocol) return;

  const protocolMessage = protocol.protocolMessage;

  if (protocolMessage?.type === 0 && enabled(jid, 'antidelete')) {
    await warn(
      sock,
      jid,
      `🗑️ DELETED MESSAGE LOG\nSender: ${cached.sender}\nMessage: ${cached.body || `[${cached.type}]`}`
    );
  }

  if (protocolMessage?.type === 14 && enabled(jid, 'antiedit')) {
    await warn(
      sock,
      jid,
      `✏️ EDITED MESSAGE DETECTED\nSender: ${cached.sender}\nPrevious message: ${cached.body || `[${cached.type}]`}`
    );
  }
}

module.exports = {
  name: 'antilink',
  aliases: COMMANDS.slice(1),
  category: 'anti',
  description: 'SIMON TECH BOT Anti Protection System',

  COMMANDS,
  handleMessage,
  handleGroupUpdate,
  handleCall,
  handleMessageUpdate,

  async execute(sock, msg, args, context) {
    const command = context.command;
    const jid = context.jid;
    const action = (args[0] || '').toLowerCase();

    const reply = text => sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    );

    if (!isGroup(jid) && command !== 'anticall') {
      return reply('❌ This command must be used in a group.');
    }

    if (!COMMANDS.includes(command)) {
      return reply('❌ Unknown Anti command.');
    }

    if (context.isGroup) {
      const metadata = await sock.groupMetadata(jid);

      if (!isAdmin(metadata, context.sender)) {
        return reply('❌ Only group admins can manage Anti settings.');
      }
    }

    if (command === 'anticall') {
      const db = readDB();
      const key = `calls:${sock.user?.id}`;

      if (!['on', 'off', 'status'].includes(action)) {
        return reply('Usage: .anticall on/off/status');
      }

      db[key] = db[key] || {};

      if (action === 'status') {
        return reply(`Anti-call: ${db[key].anticall ? 'ON' : 'OFF'}`);
      }

      db[key].anticall = action === 'on';
      writeDB(db);

      return reply(`✅ Anti-call ${action.toUpperCase()}`);
    }

    const db = readDB();

    db[jid] = db[jid] || {};

    if (action === 'status') {
      return reply(
        `🛡️ ${command.toUpperCase()}\nStatus: ${
          db[jid][command] ? 'ON' : 'OFF'
        }`
      );
    }

    if (!['on', 'off'].includes(action)) {
      return reply(
        `Usage: ${context.prefix}${command} on/off/status`
      );
    }

    db[jid][command] = action === 'on';

    if (command === 'antifake' && args[1]) {
      db[jid].allowedPrefixes = args.slice(1)
        .map(item => item.replace(/\D/g, ''))
        .filter(Boolean);
    }

    if (
      ['antitoxic', 'antibadword'].includes(command) &&
      args[1]
    ) {
      db[jid].words = args.slice(1)
        .map(word => word.toLowerCase());
    }

    if (command === 'antibot' && args[1]) {
      db[jid].blockedBots = args.slice(1);
    }

    writeDB(db);

    return reply(
      `╭━━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `│    🛡️ SIMON TECH ANTI\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `◈ Command: ${command}\n` +
      `◈ Status: ${action.toUpperCase()}\n` +
      `◈ Group: ${jid}\n\n` +
      `⚡ SIMON TECH BOT`
    );
  }
};
