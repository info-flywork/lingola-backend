'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const { pool } = require('../config/db');
const { uploadBuffer } = require('../services/bunny.service');
const { tutors, FRONTEND_ROOT } = require('../data/tutor-catalog');

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.riv') return 'application/octet-stream';
  return 'application/octet-stream';
}

function absAsset(rel) {
  return path.join(FRONTEND_ROOT, rel);
}

async function uploadAsset(relPath, destPath) {
  const full = absAsset(relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing asset: ${full}`);
  }
  const body = fs.readFileSync(full);
  const url = await uploadBuffer(destPath, body, contentTypeFor(relPath));
  console.log(`[cdn] ${relPath} → ${url} (${body.length} bytes)`);
  return url;
}

async function upsertTutor(row) {
  await pool.query(
    `INSERT INTO tutors (
       id, slug, name_key, tag_keys, voice_id,
       image_cdn_url, rive_cdn_url,
       local_image_path, local_rive_path, flag_asset_path,
       theme_json, sort_order, is_active
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name_key = VALUES(name_key),
       tag_keys = VALUES(tag_keys),
       voice_id = VALUES(voice_id),
       image_cdn_url = VALUES(image_cdn_url),
       rive_cdn_url = VALUES(rive_cdn_url),
       local_image_path = VALUES(local_image_path),
       local_rive_path = VALUES(local_rive_path),
       flag_asset_path = VALUES(flag_asset_path),
       theme_json = VALUES(theme_json),
       sort_order = VALUES(sort_order),
       is_active = 1`,
    [
      row.id,
      row.slug,
      row.nameKey,
      JSON.stringify(row.tagKeys),
      row.voiceId,
      row.imageCdnUrl,
      row.riveCdnUrl,
      row.localImage,
      row.localRive,
      row.flagAsset || null,
      row.theme ? JSON.stringify(row.theme) : null,
      row.sortOrder,
    ],
  );
}

async function main() {
  console.log(`[seed-tutors] frontend root: ${FRONTEND_ROOT}`);
  console.log(`[seed-tutors] uploading ${tutors.length} tutors to Bunny + DB...`);

  for (const tutor of tutors) {
    const id = crypto.randomUUID();
    let imageCdnUrl = null;
    let riveCdnUrl = null;

    if (tutor.localImage) {
      const ext = path.extname(tutor.localImage) || '.png';
      imageCdnUrl = await uploadAsset(
        tutor.localImage,
        `tutors/${tutor.slug}/portrait${ext}`,
      );
    }

    if (tutor.localRive) {
      riveCdnUrl = await uploadAsset(
        tutor.localRive,
        `tutors/${tutor.slug}/avatar.riv`,
      );
    }

    // Keep stable id on re-run: reuse existing row id if present
    const [existing] = await pool.query(
      'SELECT id FROM tutors WHERE slug = ? LIMIT 1',
      [tutor.slug],
    );
    const rowId = existing[0]?.id || id;

    await upsertTutor({
      id: rowId,
      slug: tutor.slug,
      nameKey: tutor.nameKey,
      tagKeys: tutor.tagKeys,
      voiceId: tutor.voiceId,
      imageCdnUrl,
      riveCdnUrl,
      localImage: tutor.localImage,
      localRive: tutor.localRive,
      flagAsset: tutor.flagAsset,
      theme: tutor.theme,
      sortOrder: tutor.sortOrder,
    });

    console.log(`[db] upserted ${tutor.slug}`);
  }

  await pool.end();
  console.log('[seed-tutors] done');
}

main().catch(async (err) => {
  console.error('[seed-tutors] failed:', err.message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
