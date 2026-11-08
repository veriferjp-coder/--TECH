
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../../config');

const SETTINGS_DIR = path.join(__dirname, '../../database');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'owner-settings.json');

if (!fs.existsSync(SETTINGS_DIR)) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};

    const settings = JSON.parse(
      fs.readFileSync(SETTINGS_FILE, 'utf8')
    );

    Object.assign(config, settings);
    return settings;
  } catch (error) {
    console.error('[OWNER SETTINGS]', error.message);
    return {};
  }
}

const settings = loadSettings();

function saveSettings() {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify({
      PREFIX: config.PREFIX,
      MODE: config.MODE,
      BOT_NAME: config.BOT_NAME,
      OWNER_NUMBER: config.OWNER_NUMBER,
      MENU_IMAGE: config.MENU_IMAGE,
      MENU_FOOTER: config.MENU_FOOTER,
      TIMEZONE: config.TIMEZONE,
      DESCRIPTION: config.DESCRIPTION,
      BOT_VERSION: config.BOT_VERSION
    }, null, 2)
  );
}

function getTarget(msg, args) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (quoted) return quoted;

  const number = args[0]?.replace(/\D/g, '');

  if (number && number.length >= 7) {
    return `${number}@s.whatsapp.net`;
  }

  return null;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }

  return `${size.toFixed(2)} ${units[index]}`;
}

function formatTime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

module.exports = {
  name: 'owner',

  aliases: [
    'setprefix', 'getprefix',
    'setmode', 'getmode',
    'setname', 'setbio',
    'block', 'unblock',
    'restart', 'shutdown',
    'reload', 'plugins', 'plugininfo',
    'stats', 'uptime', 'memory',
    'setowner', 'getowner',
    'setmenuimage', 'getmenuimage',
    'setfooter', 'getfooter',
    'settimezone', 'gettimezone',
    'setdescription', 'getdescription',
    'setversion', 'getversion',
    'serverinfo'
  ],

  category: 'owner',
  description: 'Owner and bot management commands',
  ownerOnly: true,

  async execute(sock, msg, args, context) {
    const command = context.command;
    const jid = context.jid;

    const reply = async text => {
      return sock.sendMessage(
        jid,
        { text: String(text) },
        { quoted: msg }
      );
    };

    const value = args.join(' ').trim();

    switch (command) {

      case 'owner':
        return reply(
`╭━━━━━━━━━━━━━━━━━━━━━━╮
│       👑 OWNER INFO
╰━━━━━━━━━━━━━━━━━━━━━━╯

◈ BOT: ${config.BOT_NAME}
◈ OWNER: ${config.OWNER_NAME}
◈ DEVELOPER: ${config.DEVELOPER}
◈ NUMBER: +${config.OWNER_NUMBER}
◈ VERSION: ${config.BOT_VERSION}
◈ PREFIX: ${config.PREFIX}
◈ MODE: ${config.MODE}

╰━━━ POWERED BY SIMON TECH ━━━╯`
        );

      case 'setprefix':
        if (!value || value.length > 3) {
          return reply('Usage: .setprefix !');
        }

        config.PREFIX = value;
        saveSettings();
        return reply(`✅ Prefix changed to: ${value}`);

      case 'getprefix':
        return reply(`Current prefix: ${config.PREFIX}`);

      case 'setmode':
        if (!['public', 'private'].includes(value.toLowerCase())) {
          return reply('Usage: .setmode public/private');
        }

        config.MODE = value.toLowerCase();
        saveSettings();
        return reply(`✅ Bot mode: ${config.MODE}`);

      case 'getmode':
        return reply(`Current mode: ${config.MODE}`);

      case 'setname':
        if (!value) return reply('Usage: .setname New Bot Name');

        if (typeof sock.updateProfileName !== 'function') {
          return reply('This Baileys version does not support profile name updates.');
        }

        await sock.updateProfileName(value);
        config.BOT_NAME = value;
        saveSettings();

        return reply('✅ WhatsApp profile name updated.');

      case 'setbio':
        if (!value) return reply('Usage: .setbio New profile bio');

        if (typeof sock.updateProfileStatus !== 'function') {
          return reply('Profile status update is unavailable in this Baileys version.');
        }

        await sock.updateProfileStatus(value);
        return reply('✅ WhatsApp profile bio updated.');

      case 'block': {
        const target = getTarget(msg, args);

        if (!target) {
          return reply('Reply to a user or provide their number.');
        }

        await sock.updateBlockStatus(target, 'block');
        return reply(`✅ Blocked: ${target}`);
      }

      case 'unblock': {
        const target = getTarget(msg, args);

        if (!target) {
          return reply('Reply to a user or provide their number.');
        }

        await sock.updateBlockStatus(target, 'unblock');
        return reply(`✅ Unblocked: ${target}`);
      }

      case 'restart':
        await reply('♻️ Restarting bot process...');
        process.exit(0);
        break;

      case 'shutdown':
        await reply('🛑 Shutting down bot process...');
        process.exit(0);
        break;

      case 'reload': {
        const { loadPlugins } = require('../../lib/handler');
        loadPlugins();
        return reply('✅ Plugins reloaded.');
      }

      case 'plugins': {
        const { plugins } = require('../../lib/handler');
        const unique = [...new Set(plugins.values())];

        const list = unique.map(plugin =>
          `◈ ${plugin.name} (${plugin.category || 'other'})`
        );

        return reply(
          `📦 LOADED PLUGINS: ${unique.length}\n\n` +
          (list.join('\n') || 'No plugins loaded.')
        );
      }

      case 'plugininfo': {
        const { plugins } = require('../../lib/handler');
        const plugin = plugins.get((args[0] || '').toLowerCase());

        if (!plugin) return reply('Plugin not found.');

        return reply(
`PLUGIN INFORMATION

Name: ${plugin.name}
Category: ${plugin.category || 'other'}
Description: ${plugin.description || 'No description'}
Aliases: ${(plugin.aliases || []).join(', ') || 'None'}`
        );
      }

      case 'stats': {
        const memory = process.memoryUsage();

        return reply(
`📊 BOT STATISTICS

Uptime: ${formatTime(process.uptime())}
RAM: ${formatBytes(memory.rss)}
Heap Used: ${formatBytes(memory.heapUsed)}
Heap Total: ${formatBytes(memory.heapTotal)}
Node: ${process.version}
Platform: ${process.platform}`
        );
      }

      case 'uptime':
        return reply(`⏱️ Uptime: ${formatTime(process.uptime())}`);

      case 'memory': {
        const memory = process.memoryUsage();

        return reply(
`💾 MEMORY INFORMATION

RSS: ${formatBytes(memory.rss)}
Heap Used: ${formatBytes(memory.heapUsed)}
Heap Total: ${formatBytes(memory.heapTotal)}
External: ${formatBytes(memory.external)}`
        );
      }

      case 'setowner': {
        const number = value.replace(/\D/g, '');

        if (number.length < 7 || number.length > 15) {
          return reply('Enter a valid international phone number.');
        }

        config.OWNER_NUMBER = number;
        saveSettings();

        return reply(`✅ Owner number updated: +${number}`);
      }

      case 'getowner':
        return reply(`Owner number: +${config.OWNER_NUMBER}`);

      case 'setmenuimage':
        if (!/^https:\/\/\S+/i.test(value)) {
          return reply('Usage: .setmenuimage https://image-url');
        }

        config.MENU_IMAGE = value;
        saveSettings();
        return reply('✅ Menu image URL saved.');

      case 'getmenuimage':
        return reply(`Menu image:\n${config.MENU_IMAGE}`);

      case 'setfooter':
        if (!value) return reply('Usage: .setfooter Your footer');

        config.MENU_FOOTER = value;
        saveSettings();
        return reply('✅ Menu footer updated.');

      case 'getfooter':
        return reply(`Menu footer: ${config.MENU_FOOTER}`);

      case 'settimezone':
        if (!value) return reply('Usage: .settimezone Africa/Lagos');

        try {
          new Intl.DateTimeFormat('en-US', { timeZone: value });
        } catch {
          return reply('Invalid timezone.');
        }

        config.TIMEZONE = value;
        process.env.TZ = value;
        saveSettings();

        return reply(`✅ Timezone updated: ${value}`);

      case 'gettimezone':
        return reply(`Timezone: ${config.TIMEZONE}`);

      case 'setdescription':
        if (!value) return reply('Usage: .setdescription New description');

        config.DESCRIPTION = value;
        saveSettings();
        return reply('✅ Bot description updated.');

      case 'getdescription':
        return reply(`Description: ${config.DESCRIPTION}`);

      case 'setversion':
        if (!value) return reply('Usage: .setversion 2.0.0');

        config.BOT_VERSION = value;
        saveSettings();
        return reply(`✅ Version updated: ${value}`);

      case 'getversion':
        return reply(`Bot version: ${config.BOT_VERSION}`);

      case 'serverinfo':
        return reply(
`🖥️ SERVER INFORMATION

Hostname: ${os.hostname()}
Platform: ${os.platform()}
Architecture: ${os.arch()}
CPU Cores: ${os.cpus().length}
Total RAM: ${formatBytes(os.totalmem())}
Free RAM: ${formatBytes(os.freemem())}
Node Version: ${process.version}
Process Uptime: ${formatTime(process.uptime())}`
        );

      default:
        return reply('Unknown owner command.');
    }
  }
};
      
