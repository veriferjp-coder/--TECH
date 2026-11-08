
const fs = require('fs');
const path = require('path');

const config = require('../config');

const plugins = new Map();

const PLUGIN_DIR = path.join(__dirname, '../plugins');

function loadPlugins() {
  plugins.clear();

  if (!fs.existsSync(PLUGIN_DIR)) {
    fs.mkdirSync(PLUGIN_DIR, { recursive: true });
  }

  const categories = fs.readdirSync(PLUGIN_DIR);

  for (const category of categories) {
    const categoryPath = path.join(PLUGIN_DIR, category);

    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs.readdirSync(categoryPath)
      .filter(file => file.endsWith('.js'));

    for (const file of files) {
      const pluginPath = path.join(categoryPath, file);

      try {
        delete require.cache[require.resolve(pluginPath)];

        const plugin = require(pluginPath);

        if (
          !plugin.name ||
          typeof plugin.execute !== 'function'
        ) {
          console.log(`[PLUGIN] Invalid: ${file}`);
          continue;
        }

        const commands = [
          plugin.name,
          ...(plugin.aliases || [])
        ];

        for (const command of commands) {
          plugins.set(command.toLowerCase(), plugin);
        }

        console.log(`[PLUGIN] Loaded: ${plugin.name}`);

      } catch (error) {
        console.error(`[PLUGIN ERROR] ${file}:`, error.message);
      }
    }
  }

  console.log(`[SIMON TECH] ${plugins.size} command aliases loaded.`);
}

async function handleMessage(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;

    if (!jid) return;

    const messageType = Object.keys(msg.message)[0];

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    const prefix = config.PREFIX || '.';

    if (!body.startsWith(prefix)) return;

    const text = body.slice(prefix.length).trim();

    if (!text) return;

    const args = text.split(/\s+/);
    const command = args.shift().toLowerCase();

    const plugin = plugins.get(command);

    if (!plugin) return;

    const sender = msg.key.participant || jid;

    const context = {
      jid,
      sender,
      isGroup: jid.endsWith('@g.us'),
      prefix,
      command,
      messageType,
      pushName: msg.pushName || 'User',
      isOwner: sender.split('@')[0] ===
        String(config.OWNER_NUMBER).replace(/\D/g, '')
    };

    // Private commands require owner access
    if (
      plugin.ownerOnly &&
      !context.isOwner
    ) {
      return sock.sendMessage(jid, {
        text: '❌ This command is restricted to the bot owner.'
      }, { quoted: msg });
    }

    await plugin.execute(sock, msg, args, context);

  } catch (error) {
    console.error('[HANDLER ERROR]', error);

    await sock.sendMessage(msg.key.remoteJid, {
      text: '❌ An error occurred while executing this command.'
    }, { quoted: msg }).catch(() => {});
  }
}

loadPlugins();

module.exports = {
  handleMessage,
  loadPlugins,
  plugins
};
      
