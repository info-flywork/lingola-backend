'use strict';

const { pool } = require('../config/db');

const LEVEL_MAP = {
  beginner: ['A1', 'A2'],
  intermediate: ['B1', 'B2'],
  advanced: ['C1', 'C2'],
};

function normalizeAppLevel(level) {
  if (level === 'intermediate' || level === 'advanced') return level;
  return 'beginner';
}

function nativeFields(nativeLang) {
  const code = (nativeLang || 'tr').toLowerCase().split(/[-_]/)[0];
  if (code === 'de') {
    return {
      code,
      translateCol: 'translate_de',
      sentenceCol: 'sentence_de',
      pronunciationCol: 'pronunciation_de',
    };
  }
  if (code === 'en') {
    return {
      code,
      translateCol: 'translate_en',
      sentenceCol: 'sentence_en',
      pronunciationCol: 'pronunciation_en',
    };
  }
  // Default: Turkish (and any unsupported native falls back to TR glosses).
  return {
    code: code === 'tr' ? 'tr' : code,
    translateCol: 'translate_tr',
    sentenceCol: 'sentence_tr',
    pronunciationCol: 'pronunciation_tr',
  };
}

function splitGlosses(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/// Column list shared by every `Word` query so callers always get the same
/// row shape that `mapWordRow` expects.
function WORD_SELECT_COLUMNS(native, alias = 'w') {
  const p = alias ? `${alias}.` : '';
  return `
      ${p}id,
      ${p}word,
      ${p}level,
      ${p}translate_en,
      ${p}${native.translateCol} AS translate_native,
      ${p}pronunciation_en,
      ${p}${native.pronunciationCol} AS pronunciation_native,
      ${p}sentence_en,
      ${p}${native.sentenceCol} AS sentence_native`;
}

function mapWordRow(row, native) {
  const translations = splitGlosses(row.translate_native);
  const phonetic =
    row.pronunciation_en ||
    row.pronunciation_native ||
    '';
  return {
    id: row.id,
    word: row.word,
    level: row.level,
    phonetic,
    translations: translations.length ? translations : [row.word],
    sentence: row.sentence_en || '',
    sentenceTranslation: row.sentence_native || '',
    targetLang: 'en',
    nativeLang: native.code,
  };
}

async function pickRandomWords({
  levels,
  nativeLang,
  limit = 10,
  excludeIds = [],
  requireSentence = false,
}) {
  const native = nativeFields(nativeLang);
  const max = Math.min(Math.max(Number(limit) || 10, 1), 30);

  const sentenceClause = requireSentence
    ? ` AND sentence_en IS NOT NULL AND TRIM(sentence_en) <> ''
        AND ${native.sentenceCol} IS NOT NULL AND TRIM(${native.sentenceCol}) <> ''`
    : '';

  const [rows] = await pool.query(
    `
    SELECT
      id,
      word,
      level,
      translate_en,
      ${native.translateCol} AS translate_native,
      pronunciation_en,
      ${native.pronunciationCol} AS pronunciation_native,
      sentence_en,
      ${native.sentenceCol} AS sentence_native
    FROM Word
    WHERE level IN (${levels.map(() => '?').join(',')})
      AND word IS NOT NULL
      AND TRIM(word) <> ''
      ${sentenceClause}
      ${excludeIds.length ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : ''}
    ORDER BY RAND()
    LIMIT ?
    `,
    [...levels, ...excludeIds, max],
  );

  return rows.map((row) => mapWordRow(row, native));
}

async function fetchWordsWithFallback(user, { count, excludeIds, requireSentence }) {
  const onboarding = user.onboarding || {};
  const appLevel = normalizeAppLevel(onboarding.level || 'beginner');
  const nativeLang = onboarding.nativeLanguageCode || 'tr';
  let levels = LEVEL_MAP[appLevel] || LEVEL_MAP.beginner;

  let words = await pickRandomWords({
    levels,
    nativeLang,
    limit: count,
    excludeIds,
    requireSentence,
  });

  if (!words.length && appLevel === 'advanced') {
    levels = ['B2', 'B1'];
    words = await pickRandomWords({
      levels,
      nativeLang,
      limit: count,
      excludeIds,
      requireSentence,
    });
  }

  if (!words.length) {
    words = await pickRandomWords({
      levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      nativeLang,
      limit: count,
      excludeIds,
      requireSentence,
    });
  }

  if (!words.length) {
    const err = new Error('No words available in Word table');
    err.status = 404;
    throw err;
  }

  return {
    nativeLang: (nativeLang || 'tr').toLowerCase().split(/[-_]/)[0],
    targetLang: 'en',
    level: appLevel,
    cefrLevels: levels,
    cards: words,
  };
}

async function getReadingWordsForUser(user, { count = 10, excludeIds = [] } = {}) {
  return fetchWordsWithFallback(user, {
    count: Math.min(Math.max(Number(count) || 10, 1), 30),
    excludeIds,
    requireSentence: false,
  });
}

async function getWritingPromptsForUser(user, { count = 1, excludeIds = [] } = {}) {
  return fetchWordsWithFallback(user, {
    count: Math.min(Math.max(Number(count) || 1, 1), 10),
    excludeIds,
    requireSentence: true,
  });
}

async function findWordSentenceById(wordId, nativeLang = 'tr') {
  const native = nativeFields(nativeLang);
  const [rows] = await pool.query(
    `
    SELECT
      id,
      word,
      level,
      sentence_en,
      ${native.sentenceCol} AS sentence_native
    FROM Word
    WHERE id = ?
    LIMIT 1
    `,
    [wordId],
  );
  return rows[0] || null;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textsMatch(answer, expected) {
  const a = normalizeText(answer);
  const e = normalizeText(expected);
  if (!a || !e) return false;
  if (a === e) return true;
  // Allow minor filler words / near equality by containment either way when close in length.
  if (a.includes(e) || e.includes(a)) {
    const ratio = Math.min(a.length, e.length) / Math.max(a.length, e.length);
    return ratio >= 0.7;
  }
  return false;
}

/**
 * Paginated dictionary from Word table (all levels).
 * limit defaults to 20 for infinite scroll.
 */
async function listDictionaryWords(user, {
  limit = 20,
  offset = 0,
  query = '',
} = {}) {
  const nativeLang = user.onboarding?.nativeLanguageCode || 'tr';
  const native = nativeFields(nativeLang);
  const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = Math.max(Number(offset) || 0, 0);
  const q = String(query || '').trim();

  const where = ['word IS NOT NULL', "TRIM(word) <> ''"];
  const params = [];

  if (q) {
    where.push(
      `(word LIKE ? OR ${native.translateCol} LIKE ? OR translate_en LIKE ?)`,
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = where.join(' AND ');

  const [[{ c: total }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM Word WHERE ${whereSql}`,
    params,
  );

  const [rows] = await pool.query(
    `
    SELECT
      id,
      word,
      level,
      translate_en,
      ${native.translateCol} AS translate_native,
      pronunciation_en,
      ${native.pronunciationCol} AS pronunciation_native,
      sentence_en,
      ${native.sentenceCol} AS sentence_native
    FROM Word
    WHERE ${whereSql}
    ORDER BY
      ${q ? 'CASE WHEN LOWER(word) = LOWER(?) THEN 0 WHEN LOWER(word) LIKE LOWER(?) THEN 1 ELSE 2 END,' : ''}
      word ASC
    LIMIT ? OFFSET ?
    `,
    [
      ...params,
      ...(q ? [q, `${q}%`] : []),
      take,
      skip,
    ],
  );

  const items = rows.map((row) => {
    const mapped = mapWordRow(row, native);
    return {
      id: mapped.id,
      word: mapped.word,
      translation: mapped.translations[0] || '',
      translations: mapped.translations,
      level: mapped.level,
      phonetic: mapped.phonetic,
    };
  });

  return {
    nativeLang: native.code,
    count: Number(total),
    limit: take,
    offset: skip,
    hasMore: skip + items.length < Number(total),
    items,
  };
}

async function searchDictionaryWords(user, {
  limit = 20,
  offset = 0,
  query = '',
} = {}) {
  const q = String(query || '').trim();
  if (!q) {
    return {
      nativeLang: (user.onboarding?.nativeLanguageCode || 'tr')
        .toLowerCase()
        .split(/[-_]/)[0],
      count: 0,
      limit: Math.min(Math.max(Number(limit) || 20, 1), 50),
      offset: Math.max(Number(offset) || 0, 0),
      hasMore: false,
      items: [],
    };
  }
  return listDictionaryWords(user, { limit, offset, query: q });
}

module.exports = {
  getReadingWordsForUser,
  getWritingPromptsForUser,
  findWordSentenceById,
  listDictionaryWords,
  searchDictionaryWords,
  pickRandomWords,
  textsMatch,
  normalizeText,
  LEVEL_MAP,
  normalizeAppLevel,
  nativeFields,
  mapWordRow,
  WORD_SELECT_COLUMNS,
};
