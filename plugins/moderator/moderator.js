
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const DB_DIR = path.join(__dirname, '../../database');
const WARN_FILE = path.join(DB_DIR, 'warnings.json');

const COMMANDS = [
  'kick', 'add', 'promote', 'demote', 'warn',
  'warnings', 'resetwarn', 'mute', 'unmute',
  'lock', 'unlock', 'close', 'open', 'delete',
  'pin', 'unpin', 'tagall', 'hidetag', 'groupname',
  'groupdesc', 'grouppic', 'grouplink', 'revoke',
  'approve', 'reject', 'admins', 'members', 'getpp',
  'setsubject', 'setdescription'
];

function ensureDB() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(WARN_FILE)) {
    fs.writeFileSync(WARN_FILE, '{}');
  }
}

function readWarnings() {
  ensureDB();

  try {
    return JSON.parse(fs.readFileSync(WARN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveWarnings(data) {
  ensureDB();

  const temp = WARN_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, WARN_FILE);
}

function getTarget(msg, args) {
  const quoted =
    msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (quoted) return quoted;

  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;

  if (mentioned?.length) return mentioned[0];

  const number = String(args[0] || '').replace(/\D/g, '');

  if (number.length >= 7 && number.length <= 15) {
    return `${number}@s.whatsapp.net`;
  }

  return null;
}

function getQuotedKey(msg) {
  const context =
    msg.message?.extendedTextMessage?.contextInfo;

  if (!context?.stanzaId || !context?.participant) {
    return null;
  }

  return {
    remoteJid: msg.key.remoteJid,
    fromMe: false,
    id: context.stanzaId,
    participant: context.participant
  };
}

function isAdmin(metadata, jid) {
  const member = metadata.participants.find(
    p => p.id === jid
  );

  return member?.admin === 'admin' ||
    member?.admin === 'superadmin';
}

module.exports = {
  name: 'kick',
  aliases: COMMANDS.slice(1),
  category: 'moderator',
  description: '30 group moderation commands',

  async execute(sock, msg, args, context) {
    const jid = context.jid;
    const command = context.command;
    const quoted = getQuotedKey(msg);

    const reply = text => sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    );

    if (!context.isGroup) {
      return reply('❌ This command only works in groups.');
    }

    let metadata;

    try {
      metadata = await sock.groupMetadata(jid);
    } catch {
      return reply('❌ Could not retrieve group information.');
    }

    if (!isAdmin(metadata, context.sender)) {
      return reply('❌ Only group admins can use these commands.');
    }

    if (!isAdmin(metadata, sock.user.id)) {
      return reply('❌ The bot must be a group admin.');
    }

    const target = getTarget(msg, args);
    const value = args.join(' ').trim();

    try {
      switch (command) {

        case 'kick':
          if (!target) return reply('Usage: .kick @user');
          await sock.groupParticipantsUpdate(jid, [target], 'remove');
          return reply('✅ Member removed.');

        case 'add':
          if (!target) return reply('Usage: .add 234XXXXXXXXXX');
          await sock.groupParticipantsUpdate(jid, [target], 'add');
          return reply('✅ Add-member request submitted.');

        case 'promote':
          if (!target) return reply('Usage: .promote @user');
          await sock.groupParticipantsUpdate(jid, [target], 'promote');
          return reply('✅ Member promoted to admin.');

        case 'demote':
          if (!target) return reply('Usage: .demote @user');
          await sock.groupParticipantsUpdate(jid, [target], 'demote');
          return reply('✅ Admin demoted.');

        case 'warn': {
          if (!target) return reply('Reply to or mention a member.');

          const db = readWarnings();
          db[jid] = db[jid] || {};
          db[jid][target] = db[jid][target] || [];

          db[jid][target].push({
            reason: args.slice(1).join(' ') || 'No reason provided',
            by: context.sender,
            date: new Date().toISOString()
          });

          saveWarnings(db);

          return reply(
            `⚠️ Warning issued.\n` +
            `Member: ${target}\n` +
            `Total warnings: ${db[jid][target].length}`
          );
        }

        case 'warnings': {
          if (!target) return reply('Usage: .warnings @user');

          const db = readWarnings();
          const list = db[jid]?.[target] || [];

          if (!list.length) return reply('✅ This member has no warnings.');

          return reply(
            `⚠️ WARNINGS\n\n` +
            list.map((w, i) =>
              `${i + 1}. ${w.reason}\nBy: ${w.by}\nDate: ${w.date}`
            ).join('\n\n')
          );
        }

        case 'resetwarn': {
          if (!target) return reply('Usage: .resetwarn @user');

          const db = readWarnings();

          if (db[jid]) delete db[jid][target];

          saveWarnings(db);
          return reply('✅ Member warnings cleared.');
        }

        case 'mute':
        case 'lock':
        case 'close':
          await sock.groupSettingUpdate(jid, 'announcement');
          return reply('🔒 Group closed. Only admins can send messages.');

        case 'unmute':
        case 'unlock':
        case 'open':
          await sock.groupSettingUpdate(jid, 'not_announcement');
          return reply('🔓 Group opened. All members can send messages.');

        case 'delete':
          if (!quoted) return reply('Reply to the message you want to delete.');
          await sock.sendMessage(jid, { delete: quoted });
          return reply('🗑️ Message deletion requested.');

        case 'pin':
          if (!quoted) return reply('Reply to a message to pin it.');
          await sock.sendMessage(jid, {
            pin: { type: 1, time: 86400 }
          }, { quoted: msg });
          return reply('📌 Pin request sent.');

        case 'unpin':
          if (!quoted) return reply('Reply to a pinned message.');
          await sock.sendMessage(jid, {
            pin: { type: 0, time: 86400 }
          }, { quoted: msg });
          return reply('📌 Unpin request sent.');

        case 'tagall': {
          const members = metadata.participants.map(p => p.id);

          const text =
            `📢 GROUP ANNOUNCEMENT\n\n` +
            (value || 'Attention everyone!') +
            '\n\n' +
            members.map(id => `@${id.split('@')[0]}`).join(' ');

          return sock.sendMessage(jid, {
            text,
            mentions: members
          }, { quoted: msg });
        }

        case 'hidetag': {
          const members = metadata.participants.map(p => p.id);

          return sock.sendMessage(jid, {
            text: value || 'Attention everyone!',
            mentions: members
          }, { quoted: msg });
        }

        case 'groupname':
        case 'setsubject':
          if (!value) return reply('Usage: .groupname New Group Name');
          await sock.groupUpdateSubject(jid, value);
          return reply('✅ Group name updated.');

        case 'groupdesc':
        case 'setdescription':
          if (!value) return reply('Usage: .groupdesc New description');
          await sock.groupUpdateDescription(jid, value);
          return reply('✅ Group description updated.');

        case 'grouppic': {
          const image = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: sock.logger }
          );

          if (!image) return reply('❌ Send an image with .grouppic as its caption.');

          await sock.updateProfilePicture(jid, image);
          return reply('✅ Group picture updated.');
        }

        case 'grouplink': {
          const result = await sock.groupInviteCode(jid);
          return reply(`🔗 GROUP INVITE LINK\n\nhttps://chat.whatsapp.com/${result}`);
        }

        case 'revoke':
          await sock.groupRevokeInvite(jid);
          return reply('✅ Group invitation link reset.');

        case 'approve': {
          if (!target) return reply('Usage: .approve 234XXXXXXXXXX');

          if (typeof sock.groupRequestParticipantsUpdate !== 'function') {
            return reply('❌ Join-request approval is unavailable in this Baileys version.');
          }

          await sock.groupRequestParticipantsUpdate(jid, [target], 'approve');
          return reply('✅ Join request approved.');
        }

        case 'reject': {
          if (!target) return reply('Usage: .reject 234XXXXXXXXXX');

          if (typeof sock.groupRequestParticipantsUpdate !== 'function') {
            return reply('❌ Join-request rejection is unavailable in this Baileys version.');
          }

          await sock.groupRequestParticipantsUpdate(jid, [target], 'reject');
          return reply('✅ Join request rejected.');
        }

        case 'admins': {
          const admins = metadata.participants.filter(
            p => p.admin
          );

          return reply(
            `👑 GROUP ADMINS\n\n` +
            admins.map((p, i) =>
              `${i + 1}. @${p.id.split('@')[0]}`
            ).join('\n')
          );
        }

        case 'members':
          return reply(
            `👥 GROUP MEMBERS\n\n` +
            `Group: ${metadata.subject}\n` +
            `Total members: ${metadata.participants.length}\n\n` +
            metadata.participants.map((p, i) =>
              `${i + 1}. ${p.id.split('@')[0]}${p.admin ? ' 👑' : ''}`
            ).join('\n')
          );

        case 'getpp': {
          if (!target) return reply('Usage: .getpp @user');

          const url = await sock.profilePictureUrl(target, 'image')
            .catch(() => null);

          if (!url) return reply('❌ Profile picture is unavailable.');

          return sock.sendMessage(jid, {
            image: { url },
            caption: `Profile picture: ${target.split('@')[0]}`
          }, { quoted: msg });
        }

        default:
          return reply('❌ Unknown moderator command.');
      }
    } catch (error) {
      console.error(`[MODERATOR: ${command}]`, error);

      return reply(
        `❌ ${command} failed.\n${error.message || 'Check bot permissions and try again.'}`
      );
    }
  }
};
  
