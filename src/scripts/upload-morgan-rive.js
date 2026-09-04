'use strict';

/**
 * Upload Morgan .riv to Bunny + update tutors row.
 * Usage: node src/scripts/upload-morgan-rive.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { pool } = require('../config/db');
const { uploadBuffer } = require('../services/bunny.service');

const LOCAL_RIVE = 'assets/riv/morgan.riv';
const FRONTEND_ROOT = path.join(__dirname, '../../../lingola');

async function main() {
  const full = path.join(FRONTEND_ROOT, LOCAL_RIVE);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing file: ${full}`);
  }

  const body = fs.readFileSync(full);
  const magic = body.subarray(0, 4).toString('latin1');
  if (magic !== 'RIVE') {
    throw new Error(`Not a Rive file (magic=${body.subarray(0, 4).toString('hex')})`);
  }

  const destPath = 'tutors/morgan/avatar-v2.riv';
  const riveCdnUrl = await uploadBuffer(
    destPath,
    body,
    'application/octet-stream',
  );
  console.log(`[cdn] uploaded ${body.length} bytes → ${riveCdnUrl}`);

  const [result] = await pool.query(
    `UPDATE tutors
     SET local_rive_path = ?,
         rive_cdn_url = ?
     WHERE slug = 'morgan'`,
    [LOCAL_RIVE, riveCdnUrl],
  );

  if (!result.affectedRows) {
    throw new Error('No tutors row with slug=morgan');
  }

  const [rows] = await pool.query(
    `SELECT slug, local_rive_path, rive_cdn_url
     FROM tutors WHERE slug = 'morgan' LIMIT 1`,
  );
  console.log('[db] morgan updated:', rows[0]);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[upload-morgan-rive] failed:', err.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
