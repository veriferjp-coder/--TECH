
require('dotenv').config();

const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const config = require('./config');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SESSION_DIR = path.resolve(config.SESSION_DIR || './sessions');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Active WhatsApp sessions
const sessions = new Map();
const pairingRequests = new Map();

function cleanNumber(number) {
  return String(number || '').replace(/\D/g, '');
}

async function startSession(number) {
  number = cleanNumber(number);

  if (!/^\d{10,15}$/.test(number)) {
    throw new Error('Invalid WhatsApp number.');
  }

  if (sessions.has(number)) {
    return {
      success: true,
      message: 'Session already exists.'
    };
  }

  const sessionPath = path.join(SESSION_DIR, number);

  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionPath);

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['SIMON TECH BOT', 'Chrome', '1.0.0'],
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sessions.set(number, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      pairingRequests.delete(number);
      console.log(`[SIMON TECH] ${number} connected.`);
    }

    if (connection === 'close') {
      sessions.delete(number);

      const statusCode = new Boom(
        lastDisconnect?.error
      ).output?.statusCode;

      if (
        statusCode !== DisconnectReason.loggedOut &&
        config.AUTO_RECONNECT
      ) {
        setTimeout(() => {
          startSession(number).catch(console.error);
        }, 5000);
      } else {
        pairingRequests.delete(number);
      }
    }
  });

  // Generate pairing code only for unregistered sessions
  if (!state.creds.registered) {
    const code = await sock.requestPairingCode(number);

    pairingRequests.set(number, code);

    return {
      success: true,
      number,
      code,
      message: 'Enter this code in WhatsApp Linked Devices.'
    };
  }

  return {
    success: true,
    number,
    message: 'Session started.'
  };
}

// Pairing endpoint
app.get('/pair', async (req, res) => {
  try {
    const number = cleanNumber(req.query.number);

    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Provide a WhatsApp number.'
      });
    }

    if (sessions.has(number)) {
      return res.json({
        success: true,
        message: 'This number already has an active session.'
      });
    }

    const result = await startSession(number);

    res.json(result);
  } catch (error) {
    console.error('Pairing error:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Session status
app.get('/sessions', (req, res) => {
  res.json({
    total: sessions.size,
    sessions: [...sessions.keys()]
  });
});

// Health check
app.get('/', (req, res) => {
  res.send('SIMON TECH BOT is running.');
});

// Start server
app.listen(PORT, () => {
  console.log(`
╭─────────────────────────────╮
│       SIMON TECH BOT        │
├─────────────────────────────┤
│  System: Multi-Device       │
│  Auth: Pairing Code Only    │
│  Multi-Session: Enabled     │
│  QR Scan: Disabled          │
│  Port: ${PORT}                 
╰─────────────────────────────╯
  `);
});
