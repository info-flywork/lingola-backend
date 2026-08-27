'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
  },
  bunny: {
    storageZone: process.env.BUNNY_STORAGE_ZONE || '',
    storageHostname:
      process.env.BUNNY_STORAGE_HOSTNAME || 'storage.bunnycdn.com',
    apiKey: process.env.BUNNY_API_KEY || '',
    cdnHostname: process.env.BUNNY_CDN_HOSTNAME || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'lingola-66a0a',
    appleClientId: process.env.APPLE_CLIENT_ID || '',
    googleClientIds: String(process.env.GOOGLE_CLIENT_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'WZlYpi1yf6zJhNWXih74',
  },
  revenueCat: {
    secretKey: process.env.REVENUECAT_SECRET_KEY || '',
    /** RevenueCat webhook Authorization header ile eşleşmeli. */
    webhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH || '',
  },
};

module.exports = { env };
