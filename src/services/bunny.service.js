'use strict';

const { env } = require('../config/env');

function assertBunnyConfigured() {
  if (!env.bunny.storageZone || !env.bunny.apiKey || !env.bunny.cdnHostname) {
    throw new Error('Bunny env incomplete (BUNNY_STORAGE_ZONE / API_KEY / CDN_HOSTNAME)');
  }
}

function cdnUrl(objectPath) {
  const host = env.bunny.cdnHostname.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const path = String(objectPath).replace(/^\/+/, '');
  return `https://${host}/${path}`;
}

/**
 * Upload bytes to Bunny Storage.
 * @param {string} objectPath e.g. tutors/elena/avatar.riv
 * @param {Buffer} body
 * @param {string} [contentType]
 */
async function uploadBuffer(objectPath, body, contentType = 'application/octet-stream') {
  assertBunnyConfigured();
  const path = String(objectPath).replace(/^\/+/, '');
  const url = `https://${env.bunny.storageHostname}/${env.bunny.storageZone}/${path}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      AccessKey: env.bunny.apiKey,
      'Content-Type': contentType,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny upload failed ${res.status} ${path}: ${text}`);
  }

  return cdnUrl(path);
}

module.exports = { uploadBuffer, cdnUrl, assertBunnyConfigured };
