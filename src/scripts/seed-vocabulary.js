'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');

async function upsertVocabulary(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const targetLang = (raw.targetLang || 'en').toLowerCase();
  const words = Array.isArray(raw.words) ? raw.words : [];

  let inserted = 0;
  let updated = 0;

  for (const item of words) {
    const word = String(item.word || '').trim();
    if (!word) continue;
    const level = ['beginner', 'intermediate', 'advanced'].includes(item.level)
      ? item.level
      : 'beginner';
    const phonetic = item.phonetic || null;
    const glosses = JSON.stringify(item.glosses || {});

    const [existing] = await pool.query(
      `SELECT id FROM vocabulary_words
       WHERE target_lang = ? AND word = ? AND level = ?
       LIMIT 1`,
      [targetLang, word, level],
    );

    if (existing.length) {
      await pool.query(
        `UPDATE vocabulary_words
         SET phonetic = COALESCE(?, phonetic),
             glosses_json = ?,
             is_active = 1
         WHERE id = ?`,
        [phonetic, glosses, existing[0].id],
      );
      updated += 1;
    } else {
      await pool.query(
        `INSERT INTO vocabulary_words
           (id, word, phonetic, target_lang, level, glosses_json, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [uuid(), word, phonetic, targetLang, level, glosses],
      );
      inserted += 1;
    }
  }

  return { targetLang, total: words.length, inserted, updated };
}

async function main() {
  const file =
    process.argv[2] ||
    path.join(__dirname, '../data/vocabulary_en.json');

  console.log(`[seed:vocab] ${file}`);
  const result = await upsertVocabulary(file);
  console.log(
    `[seed:vocab] ${result.targetLang}: ${result.inserted} inserted, ${result.updated} updated (${result.total} in file)`,
  );

  const [counts] = await pool.query(
    `SELECT level, COUNT(*) AS c
     FROM vocabulary_words
     WHERE target_lang = ? AND is_active = 1
     GROUP BY level
     ORDER BY FIELD(level, 'beginner', 'intermediate', 'advanced')`,
    [result.targetLang],
  );
  console.table(counts);
  await pool.end();
}

main().catch((err) => {
  console.error('[seed:vocab] failed', err);
  process.exit(1);
});
