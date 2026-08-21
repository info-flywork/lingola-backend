'use strict';

/**
 * Upload only Lingola robot .riv to Bunny + update tutors row.
 * Usage: node src/scripts/upload-lingola-rive.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { pool } = require('../config/db');
const { uploadBuffer } = require('../services/bunny.service');

const MALE_VOICE = 'sJ8GED3d0sN1d0bmD6mH';
const LOCAL_RIVE = 'assets/riv/Female/lingola_robot.riv';
const FRONTEND_ROOT = path.join(__dirname, '../../../lingola');

async function main() {
  const full = path.join(FRONTEND_ROOT, LOCAL_RIVE);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing file: ${full}`);
  }

  const body = fs.readFileSync(full);
  const riveCdnUrl = await uploadBuffer(
    'tutors/lingola/avatar.riv',
    body,
    'application/octet-stream',
  );
  console.log(`[cdn] uploaded ${body.length} bytes → ${riveCdnUrl}`);

  const [result] = await pool.query(
    `UPDATE tutors
     SET local_rive_path = ?,
         rive_cdn_url = ?,
         voice_id = ?
     WHERE slug = 'lingola'`,
    [LOCAL_RIVE, riveCdnUrl, MALE_VOICE],
  );

  if (!result.affectedRows) {
    throw new Error('No tutors row with slug=lingola');
  }

  const [rows] = await pool.query(
    `SELECT slug, voice_id, local_rive_path, rive_cdn_url
     FROM tutors WHERE slug = 'lingola' LIMIT 1`,
  );
  console.log('[db] lingola updated:', rows[0]);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[upload-lingola-rive] failed:', err.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
