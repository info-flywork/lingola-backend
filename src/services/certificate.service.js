'use strict';

const crypto = require('crypto');
const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || 'https://lingola.fly-work.com';

function cefrIndex(level) {
  const idx = CEFR_LEVELS.indexOf(String(level || '').toUpperCase());
  return idx < 0 ? -1 : idx;
}

function verifyUrl(token) {
  return `${PUBLIC_BASE_URL}/certificates/verify/${token}`;
}

function listTitleForLevel(level) {
  switch (String(level || '').toUpperCase()) {
    case 'A1':
      return 'A1 - Starter Certificate';
    case 'A2':
      return 'A2 - Basic Certificate';
    case 'B1':
      return 'B1 - Intermediate Certificate';
    case 'B2':
      return 'B2 - Upper Intermediate Certificate';
    case 'C1':
      return 'C1 - Advanced Certificate';
    case 'C2':
      return 'C2 - Expert Certificate';
    default:
      return `${String(level || '').toUpperCase()} Certificate`;
  }
}

function createVerifyToken() {
  return crypto.randomBytes(24).toString('base64url');
}

async function completedLevelsForUser(userId) {
  // Tüm seviye derslerini say; progress yoksa tamamlanmamış sayılır.
  const [rows] = await pool.query(
    `SELECT l.cefr_level,
            COUNT(*) AS total,
            SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) AS done
     FROM lessons l
     LEFT JOIN user_lesson_progress p
       ON p.lesson_id = l.id AND p.user_id = ?
     WHERE l.cefr_level IS NOT NULL AND TRIM(l.cefr_level) <> ''
     GROUP BY l.cefr_level`,
    [userId],
  );

  const completed = [];
  for (const row of rows) {
    const total = Number(row.total || 0);
    const done = Number(row.done || 0);
    if (total > 0 && done >= total) {
      completed.push(String(row.cefr_level).toUpperCase());
    }
  }
  return completed.sort((a, b) => cefrIndex(a) - cefrIndex(b));
}

async function syncCertificatesForUser(userId) {
  const completed = await completedLevelsForUser(userId);
  if (!completed.length) return [];

  const [existingRows] = await pool.query(
    `SELECT cefr_level FROM user_certificates WHERE user_id = ?`,
    [userId],
  );
  const existing = new Set(
    existingRows.map((r) => String(r.cefr_level).toUpperCase()),
  );

  for (const level of completed) {
    if (existing.has(level)) continue;
    await pool.query(
      `INSERT INTO user_certificates (id, user_id, cefr_level, verify_token, issued_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [uuid(), userId, level, createVerifyToken()],
    );
    existing.add(level);
  }

  return listCertificatesForUser(userId);
}

async function listCertificatesForUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, cefr_level, verify_token, issued_at
     FROM user_certificates
     WHERE user_id = ?
     ORDER BY FIELD(cefr_level, 'A1','A2','B1','B2','C1','C2') ASC`,
    [userId],
  );

  return rows.map((row) => {
    const cefrLevel = String(row.cefr_level).toUpperCase();
    return {
      id: row.id,
      cefrLevel,
      title: listTitleForLevel(cefrLevel),
      verifyToken: row.verify_token,
      verifyUrl: verifyUrl(row.verify_token),
      issuedAt: row.issued_at,
    };
  });
}

async function getCertificatesForUser(user) {
  await syncCertificatesForUser(user.id);
  const certificates = await listCertificatesForUser(user.id);
  const highestLevel =
    certificates.length > 0
      ? certificates[certificates.length - 1].cefrLevel
      : null;
  return { certificates, highestLevel };
}

async function findByVerifyToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return null;

  const [rows] = await pool.query(
    `SELECT c.id, c.cefr_level, c.verify_token, c.issued_at,
            u.display_name, u.deleted_at
     FROM user_certificates c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.verify_token = ?
     LIMIT 1`,
    [clean],
  );
  if (!rows.length || rows[0].deleted_at) return null;

  const row = rows[0];
  return {
    id: row.id,
    cefrLevel: String(row.cefr_level).toUpperCase(),
    verifyToken: row.verify_token,
    verifyUrl: verifyUrl(row.verify_token),
    issuedAt: row.issued_at,
    displayName: row.display_name || 'Lingola Learner',
  };
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (_) {
    return String(iso || '');
  }
}

function buildVerifyHtml(cert) {
  const name = escapeHtml(cert.displayName);
  const level = escapeHtml(cert.cefrLevel);
  const date = escapeHtml(formatDate(cert.issuedAt));
  const url = escapeHtml(cert.verifyUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lingola Certificate — ${level}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Poppins, sans-serif;
      background: linear-gradient(160deg, #f5f6fa 0%, #e8ecff 100%);
      padding: 24px;
      color: #111;
    }
    .card {
      width: min(520px, 100%);
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(45, 70, 255, 0.12);
      border: 1px solid rgba(45, 70, 255, 0.08);
    }
    .header {
      background: #0a0a0a;
      padding: 28px 24px 20px;
      text-align: center;
    }
    .header img { height: 44px; width: auto; }
    .body { padding: 28px 24px 32px; text-align: center; }
    .label { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #a1a4b7; margin-bottom: 8px; }
    .title { font-size: 22px; font-weight: 700; margin: 0 0 20px; }
    .name { font-size: 26px; font-weight: 700; color: #2d46ff; margin: 12px 0; }
    .level {
      display: inline-block; margin: 16px 0;
      padding: 10px 28px; border-radius: 999px;
      background: linear-gradient(135deg, #000088, #2d46ff);
      color: #fff; font-size: 28px; font-weight: 700; letter-spacing: 0.06em;
    }
    .meta { font-size: 14px; color: #666; margin-top: 20px; }
    .verified { margin-top: 24px; font-size: 13px; color: #2d46ff; font-weight: 600; }
    .footer { padding: 16px 24px 24px; text-align: center; font-size: 11px; color: #a1a4b7; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="https://lingola.b-cdn.net/branding/flywork-logo.png" alt="Flywork" onerror="this.style.display='none'" />
    </div>
    <div class="body">
      <div class="label">Certificate of Achievement</div>
      <h1 class="title">Lingola English Pathway</h1>
      <p>This certifies that</p>
      <div class="name">${name}</div>
      <p>has successfully completed</p>
      <div class="level">${level}</div>
      <p class="meta">Issued on ${date}</p>
      <p class="verified">✓ Verified certificate</p>
    </div>
    <div class="footer">${url}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  CEFR_LEVELS,
  syncCertificatesForUser,
  listCertificatesForUser,
  getCertificatesForUser,
  findByVerifyToken,
  buildVerifyHtml,
  verifyUrl,
};
