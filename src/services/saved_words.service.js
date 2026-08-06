'use strict';

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const {
  nativeFields,
  mapWordRow,
  WORD_SELECT_COLUMNS,
} = require('./word_bank.service');

async function saveWord(userId, wordId) {
  const [words] = await pool.query(
    'SELECT id FROM Word WHERE id = ? LIMIT 1',
    [wordId],
  );
  if (!words.length) {
    const err = new Error('Word not found');
    err.status = 404;
    throw err;
  }

  await pool.query(
    `INSERT INTO user_saved_words (id, user_id, word_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE created_at = created_at`,
    [uuid(), userId, wordId],
  );

  return { saved: true, wordId };
}

async function unsaveWord(userId, wordId) {
  await pool.query(
    'DELETE FROM user_saved_words WHERE user_id = ? AND word_id = ?',
    [userId, wordId],
  );
  return { saved: false, wordId };
}

async function listSavedWords(user, { limit = 200, query = null } = {}) {
  const nativeLang = (user.onboarding?.nativeLanguageCode || 'tr')
    .toLowerCase()
    .split(/[-_]/)[0];
  const native = nativeFields(nativeLang);
  const max = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const params = [user.id];
  let where = 'sw.user_id = ?';

  if (query && String(query).trim()) {
    where += ` AND (w.word LIKE ? OR w.${native.translateCol} LIKE ?)`;
    const like = `%${String(query).trim()}%`;
    params.push(like, like);
  }

  const [rows] = await pool.query(
    `SELECT
       sw.id AS saved_id,
       sw.created_at AS saved_at,
       ${WORD_SELECT_COLUMNS(native)}
     FROM user_saved_words sw
     INNER JOIN Word w ON w.id = sw.word_id
     WHERE ${where}
     ORDER BY sw.created_at DESC
     LIMIT ?`,
    [...params, max],
  );

  const items = rows.map((row) => {
    const mapped = mapWordRow(row, native);
    return {
      id: mapped.id,
      savedId: row.saved_id,
      word: mapped.word,
      phonetic: mapped.phonetic,
      translation: mapped.translations[0] || '',
      translations: mapped.translations,
      sentence: mapped.sentence,
      sentenceTranslation: mapped.sentenceTranslation,
      targetLang: 'en',
      level: mapped.level,
      savedAt: row.saved_at,
    };
  });

  const [[{ c }]] = await pool.query(
    'SELECT COUNT(*) AS c FROM user_saved_words WHERE user_id = ?',
    [user.id],
  );

  return {
    nativeLang: native.code,
    count: Number(c),
    items,
  };
}

async function getSavedWordIds(userId, wordIds) {
  if (!wordIds.length) return new Set();
  const [rows] = await pool.query(
    `SELECT word_id
     FROM user_saved_words
     WHERE user_id = ? AND word_id IN (?)`,
    [userId, wordIds],
  );
  return new Set(rows.map((r) => r.word_id));
}

async function getSavedCount(userId) {
  const [[{ c }]] = await pool.query(
    'SELECT COUNT(*) AS c FROM user_saved_words WHERE user_id = ?',
    [userId],
  );
  return Number(c);
}

module.exports = {
  saveWord,
  unsaveWord,
  listSavedWords,
  getSavedWordIds,
  getSavedCount,
};
