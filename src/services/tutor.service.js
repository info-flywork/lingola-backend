'use strict';

const { pool } = require('../config/db');

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function mapTutor(row) {
  return {
    id: row.id,
    slug: row.slug,
    nameKey: row.name_key,
    tagKeys: parseJson(row.tag_keys, []),
    voiceId: row.voice_id,
    imageCdnUrl: row.image_cdn_url,
    riveCdnUrl: row.rive_cdn_url,
    localImagePath: row.local_image_path,
    localRivePath: row.local_rive_path,
    flagAssetPath: row.flag_asset_path,
    theme: parseJson(row.theme_json, null),
    sortOrder: row.sort_order,
  };
}

async function listActiveTutors() {
  const [rows] = await pool.query(
    `SELECT * FROM tutors
     WHERE is_active = 1
     ORDER BY sort_order ASC, slug ASC`,
  );
  return rows.map(mapTutor);
}

module.exports = { listActiveTutors, mapTutor };
