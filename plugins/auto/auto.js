
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../../database');
const DB_FILE = path.join(DB_DIR, 'auto.json');

const COMMANDS = [
  'autoread', 'autotyping', 'autoonline', 'autorecording',
  'autoreact', 'autolikestatus', 'autoviewstatus', 'autostatus',
  'autobio', 'autoname', 'autoblock', 'autounblock',
  'autoreply', 'autoreplygroup', 'autoreplyprivate',
  'welcomeauto', 'goodbyeauto', 'antideleteauto',
  'antieditauto', 'autosticker', 'autotranslate',
  'autocorrect', 'autoprefix', 'autodownload',
  'autorespond', 'autogreet', 'autopresence',
  'autoforward', 'autoclean', 'autobackup'
];

const DEFAULTS = {
  autoread: false,
  autotyping: false,
  autoonline: false,
  autorecording: false,
  autoreact: false,
  autolikestatus: false,
  autoviewstatus: false,
  autostatus: false,
  autobio: '',
  autoname: '',
  autoblock: false,
  autounblock: false,
  autoreply: '',
  autoreplygroup: false,
  autoreplyprivate: false,
  welcomeauto: false,
  goodbyeauto: false,
  antideleteauto: false,
  antieditauto: false,
  autosticker: false,
  autotranslate: false,
  autocorrect: false,
  autoprefix: false,
  autodownload: false,
  autorespond: {},
  autogreet: false,
  autopresence: false,
  autoforward: '',
  autoclean: false,
  autobackup: false
};

function ensureDB() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
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

function saveDB(data) {
  ensureDB();

  const temp = DB_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DB_FILE);
}

function getSettings(sock) {
  const db = readDB();
  const session = sock.user?.id || 'default';

  if (!db[session]) {
    db[session] = { ...DEFAULTS };
    saveDB(db);
  }

  return db[session];
}

function updateSettings(sock, key, value) {
  const db = readDB();
  const session = sock.user?.id || 'default';

  db[session] = {
    ...DEFAULTS,
    ...(db[session] || {}),
    [key]: value
  };

  saveDB(db);
  return db[session];
}

function getBody(msg) {
  const m = msg.message || {};

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

function getText(msg) {
  return String(msg || '').trim();
}

function getQuotedMessage(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
}

module.exports = {
  name: 'autoread',
  aliases: COMMANDS.slice(1),
  category: 'auto',
  description: '30 automatic bot features',

  async execute(sock, msg, args, context) {
    const command = context.command;
    const settings = getSettings(sock);
    const value = args.join(' ').trim();

    const reply = text => sock.sendMessage(
      context.jid,
      { text },
      { quoted: msg }
    );

    const textSettings = [
      'autobio',
      'autoname',
      'autoreply',
      'autoforward'
    ];

    const objectSettings = ['autorespond'];

    if (command === 'autobackup') {
      if (!context.isOwner) {
        return reply('❌ Owner only.');
      }
    }

    if (textSettings.includes(command)) {
      if (!value) {
        return reply(
          `Current ${command}: ${settings[command] || 'Not set'}\n\n` +
          `Usage: ${context.prefix}${command} Your text`
        );
      }

      updateSettings(sock, command, value);

      if (command === 'autobio') {
        await sock.updateProfileStatus(value);
        return reply('✅ Profile bio updated and saved.');
      }

      if (command === 'autoname') {
        await sock.updateProfileName(value);
        return reply('✅ Profile name updated and saved.');
      }

      return reply(`✅ ${command} message saved.`);
    }

    if (objectSettings.includes(command)) {
      const keyword = args[0]?.toLowerCase();
      const response = args.slice(1).join(' ');

      if (!keyword || !response) {
        return reply(
          `Usage: ${context.prefix}autorespond keyword response`
        );
      }

      const updated = {
        ...settings.autorespond,
        [keyword]: response
      };

      updateSettings(sock, 'autorespond', updated);
      return reply(`✅ Auto-response saved for: ${keyword}`);
    }

    if (command === 'autoblock' || command === 'autounblock') {
      return reply(
        `ℹ️ ${command} does not automatically block or unblock people.\n` +
        'Use the manual owner block commands instead.'
      );
    }

    if (command === 'autostatus') {
      const next = !settings.autostatus;
      updateSettings(sock, 'autostatus', next);
      return reply(`✅ Automatic status features: ${next ? 'ON' : 'OFF'}`);
    }

    if (command === 'autolikestatus' || command === 'autoviewstatus') {
      const next = !settings[command];
      updateSettings(sock, command, next);
      return reply(
        `✅ ${command}: ${next ? 'ON' : 'OFF'}\n` +
        'Status-event integration will be connected in index.js later.'
      );
    }

    if (command === 'autopresence' || command === 'autoonline') {
      const next = !settings[command];
      updateSettings(sock, command, next);

      if (next) {
        await sock.sendPresenceUpdate('available');
      } else {
        await sock.sendPresenceUpdate('unavailable');
      }

      return reply(`✅ ${command}: ${next ? 'ON' : 'OFF'}`);
    }

    if (command === 'autobackup') {
      const backup = {
        bot: 'SIMON TECH BOT',
        createdAt: new Date().toISOString(),
        settings
      };

      const file = path.join(DB_DIR, 'auto-backup.json');
      fs.writeFileSync(file, JSON.stringify(backup, null, 2));

      updateSettings(sock, 'autobackup', true);
      return reply('✅ Auto settings backup created in database/auto-backup.json.');
    }

    const supported = [
      'autoread', 'autotyping', 'autorecording', 'autoreact',
      'autoreplygroup', 'autoreplyprivate', 'welcomeauto',
      'goodbyeauto', 'antideleteauto', 'antieditauto',
      'autosticker', 'autotranslate', 'autocorrect',
      'autoprefix', 'autodownload', 'autogreet',
      'autoforward', 'autoclean'
    ];

    if (!supported.includes(command)) {
      return reply('❌ Unknown auto command.');
    }

    const next = !settings[command];
    updateSettings(sock, command, next);

    return reply(
      `✅ ${command}: ${next ? 'ON' : 'OFF'}`
    );
  },

  // Call this from the message event in index.js later.
  async handleMessage(sock, msg) {
    try {
      if (!msg.message || msg.key.fromMe) return;

      const settings = getSettings(sock);
      const jid = msg.key.remoteJid;

      if (!jid || jid === 'status@broadcast') return;

      const isGroup = jid.endsWith('@g.us');
      const body = getBody(msg);
      const sender = msg.key.participant || jid;

      if (settings.autoread) {
        await sock.readMessages([msg.key]).catch(() => {});
      }

      if (settings.autotyping && !isGroup) {
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      }

      if (settings.autorecording && !isGroup) {
        await sock.sendPresenceUpdate('recording', jid).catch(() => {});
      }

      if (settings.autoreact) {
        const reactions = ['❤️', '🔥', '✨', '💯', '👍'];
        const reaction = reactions[
          Math.floor(Math.random() * reactions.length)
        ];

        await sock.sendMessage(jid, {
          react: { text: reaction, key: msg.key }
        }).catch(() => {});
      }

      if (settings.autoreply) {
        if (!isGroup && settings.autoreplyprivate) {
          await sock.sendMessage(jid, {
            text: settings.autoreply
          }, { quoted: msg });
        }

        if (isGroup && settings.autoreplygroup) {
          await sock.sendMessage(jid, {
            text: settings.autoreply
          }, { quoted: msg });
        }
      }

      if (body && settings.autorespond) {
        const lower = body.toLowerCase();

        for (const [keyword, response] of Object.entries(settings.autorespond)) {
          if (lower.includes(keyword.toLowerCase())) {
            await sock.sendMessage(jid, {
              text: response
            }, { quoted: msg });
            break;
          }
        }
      }

      if (settings.autoonline) {
        await sock.sendPresenceUpdate('available').catch(() => {});
      }

      // Other message transformations and media tasks require
      // their respective service/event integrations.
    } catch (error) {
      console.error('[AUTO MESSAGE ERROR]', error);
    }
  },

  // Call from the group-participants.update event later.
  async handleGroupUpdate(sock, update) {
    try {
      const settings = getSettings(sock);

      if (!update.id || !update.participants?.length) return;

      if (update.action === 'add' && settings.welcomeauto) {
        for (const user of update.participants) {
          await sock.sendMessage(update.id, {
            text: `👋 Welcome @${user.split('@')[0]} to the group!`,
            mentions: [user]
          });
        }
      }

      if (update.action === 'remove' && settings.goodbyeauto) {
        for (const user of update.participants) {
          await sock.sendMessage(update.id, {
            text: `👋 Goodbye @${user.split('@')[0]}.`,
            mentions: [user]
          });
        }
      }
    } catch (error) {
      console.error('[AUTO GROUP ERROR]', error);
    }
  },

  // Call from status-related events when supported.
  async handleStatus(sock, msg) {
    try {
      const settings = getSettings(sock);

      if (!settings.autostatus || !msg.key) return;

      if (settings.autoviewstatus) {
        await sock.readMessages([msg.key]).catch(() => {});
      }

      if (settings.autolikestatus) {
        await sock.sendMessage(msg.key.remoteJid, {
          react: { text: '❤️', key: msg.key }
        }).catch(() => {});
      }
    } catch (error) {
      console.error('[AUTO STATUS ERROR]', error);
    }
  }
};
  
