
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const COMMANDS = [
  'groupinfo', 'grouplink', 'revoke', 'groupname',
  'groupdesc', 'grouppic', 'tagall', 'hidetag',
  'admins', 'members', 'totag', 'invite',
  'leave', 'join', 'getpp', 'setsubject',
  'setdescription', 'groupopen', 'groupclose', 'groupowner'
];

function getTarget(msg, args) {
  const context =
    msg.message?.extendedTextMessage?.contextInfo;

  if (context?.mentionedJid?.length) {
    return context.mentionedJid[0];
  }

  if (context?.participant) return context.participant;

  const number = String(args[0] || '').replace(/\D/g, '');

  if (number.length >= 7 && number.length <= 15) {
    return `${number}@s.whatsapp.net`;
  }

  return null;
}

function isAdmin(metadata, jid) {
  const participant = metadata.participants.find(
    p => p.id === jid
  );

  return participant?.admin === 'admin' ||
    participant?.admin === 'superadmin';
}

function isBotAdmin(metadata, sock) {
  return isAdmin(metadata, sock.user.id);
}

module.exports = {
  name: 'groupinfo',
  aliases: COMMANDS.slice(1),
  category: 'group',
  description: '20 WhatsApp group management commands',

  async execute(sock, msg, args, context) {
    const jid = context.jid;
    const command = context.command;
    const value = args.join(' ').trim();

    const reply = text => sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    );

    if (!context.isGroup &&
        !['join'].includes(command)) {
      return reply('❌ This command must be used in a group.');
    }

    if (command === 'join') {
      if (!context.isOwner) {
        return reply('❌ Only the bot owner can make the bot join a group.');
      }

      const match = value.match(
        /(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9]+)/i
      );

      if (!match) {
        return reply('Usage: .join https://chat.whatsapp.com/INVITECODE');
      }

      try {
        await sock.groupAcceptInvite(match[1]);
        return reply('✅ Bot joined the group successfully.');
      } catch (error) {
        return reply(`❌ Could not join group: ${error.message}`);
      }
    }

    if (command === 'leave') {
      if (!context.isOwner) {
        return reply('❌ Only the bot owner can use this command.');
      }

      await reply('👋 Leaving this group.');
      await sock.groupLeave(jid);
      return;
    }

    let metadata;

    try {
      metadata = await sock.groupMetadata(jid);
    } catch {
      return reply('❌ Unable to retrieve group information.');
    }

    const managementCommands = [
      'revoke', 'groupname', 'groupdesc', 'grouppic',
      'groupopen', 'groupclose', 'setsubject',
      'setdescription'
    ];

    if (managementCommands.includes(command)) {
      if (!isAdmin(metadata, context.sender)) {
        return reply('❌ Only group admins can use this command.');
      }

      if (!isBotAdmin(metadata, sock)) {
        return reply('❌ The bot must be a group admin.');
      }
    }

    try {
      switch (command) {

        case 'groupinfo': {
          const admins = metadata.participants.filter(p => p.admin);

          return reply(
            `╭━━〔 GROUP INFORMATION 〕━━╮\n` +
            `│ Name: ${metadata.subject}\n` +
            `│ ID: ${jid}\n` +
            `│ Members: ${metadata.participants.length}\n` +
            `│ Admins: ${admins.length}\n` +
            `│ Created: ${metadata.creation || 'Unavailable'}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯`
          );
        }

        case 'grouplink': {
          const code = await sock.groupInviteCode(jid);

          return reply(
            `🔗 GROUP INVITATION LINK\n\n` +
            `https://chat.whatsapp.com/${code}`
          );
        }

        case 'revoke':
          await sock.groupRevokeInvite(jid);
          return reply('✅ Group invitation link has been reset.');

        case 'groupname':
        case 'setsubject':
          if (!value) {
            return reply(`Usage: .${command} New Group Name`);
          }

          await sock.groupUpdateSubject(jid, value);
          return reply('✅ Group name updated.');

        case 'groupdesc':
        case 'setdescription':
          if (!value) {
            return reply(`Usage: .${command} New group description`);
          }

          await sock.groupUpdateDescription(jid, value);
          return reply('✅ Group description updated.');

        case 'grouppic': {
          const imageMessage =
            msg.message?.imageMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

          if (!imageMessage) {
            return reply('❌ Send or reply to an image with .grouppic.');
          }

          const source = msg.message.imageMessage
            ? msg
            : {
                key: {
                  ...msg.key,
                  id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                  participant: msg.message.extendedTextMessage.contextInfo.participant
                },
                message: {
                  imageMessage
                }
              };

          const buffer = await downloadMediaMessage(
            source,
            'buffer',
            {},
            { logger: sock.logger }
          );

          await sock.updateProfilePicture(jid, buffer);
          return reply('✅ Group picture updated.');
        }

        case 'tagall':
        case 'hidetag': {
          const members = metadata.participants.map(p => p.id);

          const message = command === 'tagall'
            ? `📢 GROUP ANNOUNCEMENT\n\n${value || 'Attention everyone!'}\n\n` +
              members.map(id => `@${id.split('@')[0]}`).join(' ')
            : value || 'Attention everyone!';

          return sock.sendMessage(jid, {
            text: message,
            mentions: members
          }, { quoted: msg });
        }

        case 'admins': {
          const admins = metadata.participants.filter(p => p.admin);

          return reply(
            `👑 GROUP ADMINS\n\n` +
            admins.map((p, i) =>
              `${i + 1}. @${p.id.split('@')[0]}`
            ).join('\n')
          );
        }

        case 'members':
          return reply(
            `👥 GROUP MEMBERS\n` +
            `Total: ${metadata.participants.length}\n\n` +
            metadata.participants.map((p, i) =>
              `${i + 1}. ${p.id.split('@')[0]}${p.admin ? ' 👑' : ''}`
            ).join('\n')
          );

        case 'totag': {
          const target = getTarget(msg, args);

          if (!target) {
            return reply('Mention or reply to a member. Usage: .totag @user');
          }

          return sock.sendMessage(jid, {
            text: `@${target.split('@')[0]} ${args.slice(1).join(' ')}`,
            mentions: [target]
          }, { quoted: msg });
        }

        case 'invite': {
          const target = getTarget(msg, args);

          if (!target) {
            return reply('Usage: .invite 234XXXXXXXXXX');
          }

          const code = await sock.groupInviteCode(jid);
          const link = `https://chat.whatsapp.com/${code}`;

          await sock.sendMessage(target, {
            text: `You have been invited to join ${metadata.subject}:\n${link}`
          });

          return reply('✅ Group invitation sent privately.');
        }

        case 'getpp': {
          const target = getTarget(msg, args);

          if (!target) {
            return reply('Usage: .getpp @user');
          }

          const url = await sock.profilePictureUrl(target, 'image')
            .catch(() => null);

          if (!url) {
            return reply('❌ Profile picture unavailable.');
          }

          return sock.sendMessage(jid, {
            image: { url },
            caption: `Profile picture: ${target.split('@')[0]}`
          }, { quoted: msg });
        }

        case 'groupopen':
          await sock.groupSettingUpdate(jid, 'not_announcement');
          return reply('🔓 Group opened. All members can send messages.');

        case 'groupclose':
          await sock.groupSettingUpdate(jid, 'announcement');
          return reply('🔒 Group closed. Only admins can send messages.');

        case 'groupowner': {
          const owner = metadata.owner;

          if (!owner) {
            return reply('Group creator information is unavailable.');
          }

          return reply(`👑 GROUP CREATOR\n\n@${owner.split('@')[0]}`);
        }

        default:
          return reply('❌ Unknown group command.');
      }
    } catch (error) {
      console.error(`[GROUP: ${command}]`, error);

      return reply(
        `❌ Command failed: ${error.message || 'Check bot permissions.'}`
      );
    }
  }
};
