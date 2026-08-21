'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAPSHOT = path.join(__dirname, 'lesson-catalog.json');
const FRONTEND_I18N = path.join(__dirname, '../../../lingola/lib/i18n');
const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

function idFromSlug(slug) {
  const hash = crypto
    .createHash('sha1')
    .update(`lingola-lesson:${slug}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function slugify(cefr, title, sortOrder) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${cefr.toLowerCase()}-${base || `lesson-${sortOrder}`}`;
}

function fromSnapshot() {
  if (!fs.existsSync(SNAPSHOT)) return null;
  const rows = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.map((row) => ({
    id: idFromSlug(row.slug),
    slug: row.slug,
    cefrLevel: row.cefrLevel,
    sortOrder: row.sortOrder,
    titleEn: row.titleEn,
    titleTr: row.titleTr,
  }));
}

function fromI18n() {
  const enPath = path.join(FRONTEND_I18N, 'en.i18n.json');
  const trPath = path.join(FRONTEND_I18N, 'tr.i18n.json');
  if (!fs.existsSync(enPath) || !fs.existsSync(trPath)) return null;
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const tr = JSON.parse(fs.readFileSync(trPath, 'utf8'));
  const enLevels = en.lessonPage?.levels || {};
  const trLevels = tr.lessonPage?.levels || {};

  const catalog = [];
  const used = new Set();

  for (const levelId of LEVELS) {
    const enLessons = enLevels[levelId]?.lessons || [];
    const trLessons = trLevels[levelId]?.lessons || [];
    const cefr = levelId.toUpperCase();
    for (let i = 0; i < enLessons.length; i += 1) {
      const titleEn = String(enLessons[i] || `Lesson ${i + 1}`).trim();
      const titleTr = String(trLessons[i] || titleEn).trim();
      let slug = slugify(cefr, titleEn, i);
      if (used.has(slug)) slug = `${slug}-${i}`;
      used.add(slug);
      catalog.push({
        id: idFromSlug(slug),
        slug,
        cefrLevel: cefr,
        sortOrder: i,
        titleEn,
        titleTr,
      });
    }
  }
  return catalog;
}

function loadLessonCatalog() {
  return fromSnapshot() || fromI18n() || [];
}

module.exports = { loadLessonCatalog, LEVELS };
