
const config = require('../../config');
const { plugins } = require('../../lib/handler');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands'],
  category: 'system',
  description: 'Display bot command menu',

  async execute(sock, msg, args, context) {
    const categories = {};

    for (const [name, plugin] of plugins) {
      const category = plugin.category || 'other';

      if (!categories[category]) {
        categories[category] = new Set();
      }

      categories[category].add(plugin.name);
    }

    const icons = {
      owner: '👑',
      system: '🤖',
      anti: '🛡️',
      group: '👥',
      ai: '🧠',
      downloader: '📥',
      sticker: '🖼️',
      utility: '⚙️',
      games: '🎮',
      economy: '💰',
      security: '🔐',
      media: '🎥',
      developer: '🚀'
    };

    const format = value =>
      value.charAt(0).toUpperCase() + value.slice(1);

    let menu = `
╭━━━━━━━━━━━━━━━━━━━━━━╮
│      🤖 SIMON TECH BOT
╰━━━━━━━━━━━━━━━━━━━━━━╯

👑 Developer: ${config.OWNER_NAME}
🤖 Bot: ${config.BOT_NAME}
⚡ Prefix: ${context.prefix}
📦 Commands: ${plugins.size}
🔗 Mode: ${config.MODE}

`;

    for (const category of Object.keys(categories).sort()) {
      const commands = [...categories[category]];

      menu += `
╭━━━ ${icons[category] || '📌'} ${format(category)} ━━━
`;

      menu += commands
        .sort()
        .map(command => `│ ◈ ${context.prefix}${command}`)
        .join('\n');

      menu += '\n╰━━━━━━━━━━━━━━━━━━━━━━\n';
    }

    menu += `
╭━━━━━━━━━━━━━━━━━━━━━━╮
│ POWERED BY SIMON TECH
╰━━━━━━━━━━━━━━━━━━━━━━╯
`;

    await sock.sendMessage(context.jid, {
      text: menu
    }, { quoted: msg });
  }
};
      
