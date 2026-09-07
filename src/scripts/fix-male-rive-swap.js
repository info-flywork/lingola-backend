'use strict';

/**
 * Julian/Marco/Erik Rive dosyaları birbirine kaymıştı.
 * Doğru içerik: avatar1=Erik, avatar2=Julian, avatar3=Marco
 *
 * CDN'e yeni dosya adı ile yükler (cache bust) + uzak DB günceller.
 * Usage: node src/scripts/fix-male-rive-swap.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { pool } = require('../config/db');
const { uploadBuffer } = require('../services/bunny.service');
const { FRONTEND_ROOT } = require('../data/tutor-catalog');

const FIXES = [
  {
    slug: 'julian',
    localRive: 'assets/riv/Male/avatar2.riv',
    cdnObject: 'tutors/julian/avatar-v2.riv',
  },
  {
    slug: 'marco',
    localRive: 'assets/riv/Male/avatar3.riv',
    cdnObject: 'tutors/marco/avatar-v2.riv',
  },
  {
    slug: 'erik',
    localRive: 'assets/riv/Male/avatar1.riv',
    cdnObject: 'tutors/erik/avatar-v2.riv',
  },
];

async function main() {
  for (const fix of FIXES) {
    const full = path.join(FRONTEND_ROOT, fix.localRive);
    if (!fs.existsSync(full)) {
      throw new Error(`Missing local rive: ${full}`);
    }
    const body = fs.readFileSync(full);
    const riveCdnUrl = await uploadBuffer(
      fix.cdnObject,
      body,
      'application/octet-stream',
    );
    // Aynı path'i de üzerine yaz (eski URL kullanan istemciler).
    const legacyPath = `tutors/${fix.slug}/avatar.riv`;
    await uploadBuffer(legacyPath, body, 'application/octet-stream');

    const [result] = await pool.query(
      `UPDATE tutors
       SET local_rive_path = ?, rive_cdn_url = ?
       WHERE slug = ?`,
      [fix.localRive, riveCdnUrl, fix.slug],
    );
    console.log(
      `[fix] ${fix.slug} → ${fix.localRive} | ${riveCdnUrl} (rows=${result.affectedRows}, bytes=${body.length})`,
    );
  }

  const [rows] = await pool.query(
    `SELECT slug, local_rive_path, rive_cdn_url
     FROM tutors
     WHERE slug IN ('julian','marco','erik')
     ORDER BY slug`,
  );
  console.table(rows);
  await pool.end();
  console.log('[fix-male-rive-swap] done');
}

main().catch(async (err) => {
  console.error('[fix-male-rive-swap] failed:', err.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
