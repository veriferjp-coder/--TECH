
require('dotenv').config();

module.exports = {
  // BOT INFORMATION
  BOT_NAME: 'SIMON TECH BOT',
  BOT_VERSION: '1.0.0',
  PREFIX: '.',
  MODE: 'public',

  // DEVELOPER
  OWNER_NAME: 'SIMON TECH',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '234XXXXXXXXXX',
  DEVELOPER: 'SIMON TECH',

  // AUTHENTICATION
  AUTH_METHOD: 'pairing',
  PAIRING_ENABLED: true,
  QR_ENABLED: false,
  MULTI_DEVICE: true,
  SESSION_DIR: './sessions',
  AUTO_RECONNECT: true,

  // SERVER
  PORT: process.env.PORT || 3000,
  TIMEZONE: 'Africa/Lagos',

  // DATABASE
  DATABASE: './database/data.json',

  // AI
  AI_ENABLED: true,
  AI_MODEL: 'llama-3.3-70b-versatile',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',

  // AUTOMATION
  AUTO_READ: false,
  AUTO_TYPING: false,
  AUTO_REACT: false,
  ANTI_CALL: false,

  // SECURITY
  SAFE_MODE: true,
  MAINTENANCE: false,

  // MENU
  MENU_IMAGE: 'https://files.catbox.moe/msvhxd.png',
  MENU_FOOTER: 'POWERED BY SIMON TECH',

  // COMMANDS
  TOTAL_COMMANDS: 500,

  // BRANDING
  DESCRIPTION: 'Powerful Multi-Device WhatsApp Bot',
  POWERED_BY: 'SIMON TECH'
};
  
