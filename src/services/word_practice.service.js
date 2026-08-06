'use strict';

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const { getSavedWordIds } = require('./saved_words.service');
const {
  LEVEL_MAP,
  normalizeAppLevel,
  nativeFields,
  mapWordRow,
  WORD_SELECT_COLUMNS,
} = require('./word_bank.service');

// Words already shown within this window are pushed to the back of the queue
// so a session keeps rotating through the bank.
const RECENT_DAYS = 3;

async function pickPracticeWords({ userId, levels, nativeLang, limit }) {
  const native = nativeFields(nativeLang);
  const max = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const levelPlaceholders = levels.map(() => '?').join(',');

  const [rows] = await pool.query(
    `
    SELECT
      ${WORD_SELECT_COLUMNS(native)}
    FROM Word w
    LEFT JOIN user_word_encounters ue
      ON ue.word_id = w.id AND ue.user_id = ?
    WHERE w.level IN (${levelPlaceholders})
      AND w.word IS NOT NULL
      AND TRIM(w.word) <> ''
      AND w.sentence_en IS NOT NULL
      AND TRIM(w.sentence_en) <> ''
    ORDER BY
      (
        ue.last_seen_at IS NOT NULL
        AND ue.last_seen_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${RECENT_DAYS} DAY)
      ) ASC,
      COALESCE(ue.seen_count, 0) ASC,
      RAND()
    LIMIT ?
    `,
    [userId, ...levels, max],
  );

  return rows.map((row) => mapWordRow(row, native));
}

async function recordEncounters(userId, wordIds) {
  if (!userId || !wordIds.length) return;
  const values = wordIds.map(() => '(?, ?, ?, 1, UTC_TIMESTAMP(3))').join(', ');
  const params = [];
  for (const wordId of wordIds) params.push(uuid(), userId, wordId);

  await pool.query(
    `INSERT INTO user_word_encounters
       (id, user_id, word_id, seen_count, last_seen_at)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE
       seen_count = seen_count + 1,
       last_seen_at = UTC_TIMESTAMP(3)`,
    params,
  );
}

async function getPracticeCardsForUser(user, { count = 5 } = {}) {
  const onboarding = user.onboarding || {};
  const nativeLang = (onboarding.nativeLanguageCode || 'tr')
    .toLowerCase()
    .split(/[-_]/)[0];
  const appLevel = normalizeAppLevel(onboarding.level || 'beginner');
  const limit = Math.min(Math.max(Number(count) || 5, 1), 10);

  let levels = LEVEL_MAP[appLevel] || LEVEL_MAP.beginner;
  let words = await pickPracticeWords({
    userId: user.id,
    levels,
    nativeLang,
    limit,
  });

  if (!words.length) {
    levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    words = await pickPracticeWords({
      userId: user.id,
      levels,
      nativeLang,
      limit,
    });
  }

  if (!words.length) {
    const err = new Error('No words available in Word table');
    err.status = 404;
    throw err;
  }

  const savedIds = await getSavedWordIds(
    user.id,
    words.map((row) => row.id),
  );

  const cards = words.map((row) => ({
    ...row,
    saved: savedIds.has(row.id),
  }));

  await recordEncounters(
    user.id,
    words.map((row) => row.id),
  );

  return {
    nativeLang,
    targetLang: 'en',
    level: appLevel,
    cefrLevels: levels,
    cards,
  };
}

module.exports = {
  getPracticeCardsForUser,
};
