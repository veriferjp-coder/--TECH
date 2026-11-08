
module.exports = {
  name: 'ping',
  aliases: ['speed'],
  category: 'system',
  description: 'Check bot response',

  async execute(sock, msg, args, context) {
    const start = Date.now();

    await sock.sendMessage(context.jid, {
      text: '🏓 SIMON TECH BOT: Pong!'
    }, { quoted: msg });
  }
};
  
