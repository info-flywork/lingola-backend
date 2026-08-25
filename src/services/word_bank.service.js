'use strict';

const { pool } = require('../config/db');
const { resolveContentNativeLang, normalizeLangCode } = require('../utils/locale');

const LEVEL_MAP = {
  beginner: ['A1', 'A2'],
  intermediate: ['B1', 'B2'],
  advanced: ['C1', 'C2'],
};

const NATIVE_COLUMN_MAP = {
  en: {
    translateCol: 'translate_en',
    sentenceCol: 'sentence_en',
    pronunciationCol: 'pronunciation_en',
  },
  tr: {
    translateCol: 'translate_tr',
    sentenceCol: 'sentence_tr',
    pronunciationCol: 'pronunciation_tr',
  },
  de: {
    translateCol: 'translate_de',
    sentenceCol: 'sentence_de',
    pronunciationCol: 'pronunciation_de',
  },
  ja: {
    translateCol: 'translate_ja',
    sentenceCol: 'sentence_ja',
    pronunciationCol: 'pronunciation_ja',
  },
  fr: {
    translateCol: 'translate_fr',
    sentenceCol: 'sentence_fr',
    pronunciationCol: 'pronunciation_fr',
  },
  es: {
    translateCol: 'translate_es',
    sentenceCol: 'sentence_es',
    pronunciationCol: 'pronunciation_es',
  },
  ru: {
    translateCol: 'translate_ru',
    sentenceCol: 'sentence_ru',
    pronunciationCol: 'pronunciation_ru',
  },
  hi: {
    translateCol: 'translate_hi',
    sentenceCol: 'sentence_hi',
    pronunciationCol: 'pronunciation_hi',
  },
  pt: {
    translateCol: 'translate_pt',
    sentenceCol: 'sentence_pt',
    pronunciationCol: 'pronunciation_pt',
  },
  zh: {
    translateCol: 'translate_zh',
    sentenceCol: 'sentence_zh',
    pronunciationCol: 'pronunciation_zh',
  },
  it: {
    translateCol: 'translate_it',
    sentenceCol: 'sentence_it',
    pronunciationCol: 'pronunciation_it',
  },
};

function normalizeAppLevel(level) {
  if (level === 'intermediate' || level === 'advanced') return level;
  return 'beginner';
}

function nativeFields(nativeLang) {
  const code = normalizeLangCode(nativeLang, 'tr');
  const cols = NATIVE_COLUMN_MAP[code] || NATIVE_COLUMN_MAP.tr;
  return { code, ...cols };
}

function splitGlosses(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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

function mapRowsForNative(rows, nativeLang) {
  const native = nativeFields(nativeLang);
  return rows.map((row) => {
    const mapped = mapWordRow(row, native);
    return { ...mapped, nativeLang: native.code };
  });
}

function nativeContentClause(native, alias = 'w') {
  return ` AND ${alias}.${native.translateCol} IS NOT NULL
      AND TRIM(${alias}.${native.translateCol}) <> ''`;
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
    ? ` AND w.sentence_en IS NOT NULL AND TRIM(w.sentence_en) <> ''
        AND w.${native.sentenceCol} IS NOT NULL AND TRIM(w.${native.sentenceCol}) <> ''`
    : '';

  const [rows] = await pool.query(
    `
    SELECT
      ${WORD_SELECT_COLUMNS(native, 'w')}
    FROM Word w
    WHERE w.level IN (${levels.map(() => '?').join(',')})
      AND w.word IS NOT NULL
      AND TRIM(w.word) <> ''
      ${nativeContentClause(native)}
      ${sentenceClause}
      ${excludeIds.length ? `AND w.id NOT IN (${excludeIds.map(() => '?').join(',')})` : ''}
    ORDER BY RAND()
    LIMIT ?
    `,
    [...levels, ...excludeIds, max],
  );

  return rows;
}

async function fetchWordsWithFallback(user, { count, excludeIds, requireSentence }) {
  const onboarding = user.onboarding || {};
  const appLevel = normalizeAppLevel(onboarding.level || 'beginner');
  const nativeLang = resolveContentNativeLang(user);
  let levels = LEVEL_MAP[appLevel] || LEVEL_MAP.beginner;

  let rows = await pickRandomWords({
    levels,
    nativeLang,
    limit: count,
    excludeIds,
    requireSentence,
  });

  if (!rows.length && appLevel === 'advanced') {
    levels = ['B2', 'B1'];
    rows = await pickRandomWords({
      levels,
      nativeLang,
      limit: count,
      excludeIds,
      requireSentence,
    });
  }

  if (!rows.length) {
    rows = await pickRandomWords({
      levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
      nativeLang,
      limit: count,
      excludeIds,
      requireSentence,
    });
  }

  if (!rows.length) {
    const err = new Error('No words available in Word table');
    err.status = 404;
    throw err;
  }

  return {
    nativeLang: normalizeLangCode(nativeLang),
    targetLang: 'en',
    level: appLevel,
    cefrLevels: levels,
    cards: mapRowsForNative(rows, nativeLang),
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

/** Yazma testi: günlük/every day, kısaltmalar, yakın eşanlamlılar. */
const WRITING_PHRASE_EQUIVALENTS = [
  [/\bevery\s+day\b/g, 'daily'],
  [/\beveryday\b/g, 'daily'],
  [/\beach\s+day\b/g, 'daily'],
];

const WRITING_WORD_GROUPS = [
  ['children', 'kids', 'kid'],
  ['mother', 'mom', 'mum'],
  ['father', 'dad', 'daddy'],
  ['large', 'big'],
  ['small', 'little', 'tiny'],
  ['quick', 'fast', 'rapid'],
  ['start', 'begin'],
  ['finish', 'end'],
  ['purchase', 'buy'],
  ['automobile', 'car'],
  ['television', 'tv'],
  ['hello', 'hi'],
  ['thanks', 'thank', 'thankyou'],
];

function expandWritingContractions(text) {
  return text
    .replace(/\bdon t\b/g, 'do not')
    .replace(/\bdoesn t\b/g, 'does not')
    .replace(/\bdidn t\b/g, 'did not')
    .replace(/\bcan t\b/g, 'cannot')
    .replace(/\bwon t\b/g, 'will not')
    .replace(/\bisn t\b/g, 'is not')
    .replace(/\baren t\b/g, 'are not')
    .replace(/\bwasn t\b/g, 'was not')
    .replace(/\bweren t\b/g, 'were not')
    .replace(/\bhasn t\b/g, 'has not')
    .replace(/\bhaven t\b/g, 'have not')
    .replace(/\bhadn t\b/g, 'had not')
    .replace(/\bi m\b/g, 'i am')
    .replace(/\byou re\b/g, 'you are')
    .replace(/\bhe s\b/g, 'he is')
    .replace(/\bshe s\b/g, 'she is')
    .replace(/\bit s\b/g, 'it is')
    .replace(/\bwe re\b/g, 'we are')
    .replace(/\bthey re\b/g, 'they are')
    .replace(/\bi ve\b/g, 'i have')
    .replace(/\byou ve\b/g, 'you have')
    .replace(/\bwe ve\b/g, 'we have')
    .replace(/\bthey ve\b/g, 'they have')
    .replace(/\bi ll\b/g, 'i will')
    .replace(/\byou ll\b/g, 'you will')
    .replace(/\bhe ll\b/g, 'he will')
    .replace(/\bshe ll\b/g, 'she will')
    .replace(/\bwe ll\b/g, 'we will')
    .replace(/\bthey ll\b/g, 'they will');
}

function canonicalWritingWord(word) {
  const w = String(word || '').toLowerCase();
  for (const group of WRITING_WORD_GROUPS) {
    if (group.includes(w)) return group[0];
  }
  return w;
}

function normalizeWritingText(value) {
  let text = normalizeText(value);
  text = expandWritingContractions(text);
  for (const [pattern, replacement] of WRITING_PHRASE_EQUIVALENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .split(' ')
    .map((token) => canonicalWritingWord(token))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function writingTokensEquivalent(a, b) {
  if (a === b) return true;
  if (canonicalWritingWord(a) === canonicalWritingWord(b)) return true;
  if (a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= 1) return true;
  return false;
}

function textsMatch(answer, expected) {
  const a = normalizeWritingText(answer);
  const e = normalizeWritingText(expected);
  if (!a || !e) return false;
  if (a === e) return true;

  const aTokens = a.split(' ').filter(Boolean);
  const eTokens = e.split(' ').filter(Boolean);

  if (aTokens.length === eTokens.length && aTokens.length > 0) {
    let mismatches = 0;
    for (let i = 0; i < aTokens.length; i += 1) {
      if (!writingTokensEquivalent(aTokens[i], eTokens[i])) mismatches += 1;
    }
    if (mismatches === 0) return true;
    // Uzun cümlede tek kelimelik yazım farkına tolerans.
    if (mismatches === 1 && aTokens.length >= 5) return true;
  }

  if (a.includes(e) || e.includes(a)) {
    const ratio = Math.min(a.length, e.length) / Math.max(a.length, e.length);
    return ratio >= 0.85;
  }
  return false;
}

async function listDictionaryWords(user, {
  limit = 20,
  offset = 0,
  query = '',
} = {}) {
  const nativeLang = resolveContentNativeLang(user);
  const native = nativeFields(nativeLang);
  const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = Math.max(Number(offset) || 0, 0);
  const q = String(query || '').trim();

  const where = [
    'w.word IS NOT NULL',
    "TRIM(w.word) <> ''",
    `w.${native.translateCol} IS NOT NULL`,
    `TRIM(w.${native.translateCol}) <> ''`,
  ];
  const params = [];

  if (q) {
    where.push(
      `(w.word LIKE ? OR w.${native.translateCol} LIKE ? OR w.translate_en LIKE ?)`,
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = where.join(' AND ');

  const [[{ c: total }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM Word w WHERE ${whereSql}`,
    params,
  );

  const [rows] = await pool.query(
    `
    SELECT
      ${WORD_SELECT_COLUMNS(native, 'w')}
    FROM Word w
    WHERE ${whereSql}
    ORDER BY
      ${q ? 'CASE WHEN LOWER(w.word) = LOWER(?) THEN 0 WHEN LOWER(w.word) LIKE LOWER(?) THEN 1 ELSE 2 END,' : ''}
      w.word ASC
    LIMIT ? OFFSET ?
    `,
    [
      ...params,
      ...(q ? [q, `${q}%`] : []),
      take,
      skip,
    ],
  );

  const mapped = mapRowsForNative(rows, nativeLang);
  const items = mapped.map((row) => ({
    id: row.id,
    word: row.word,
    translation: row.translations[0] || '',
    translations: row.translations,
    level: row.level,
    phonetic: row.phonetic,
  }));

  return {
    nativeLang: normalizeLangCode(nativeLang),
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
      nativeLang: normalizeLangCode(resolveContentNativeLang(user)),
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
  mapRowsForNative,
  nativeContentClause,
  NATIVE_COLUMN_MAP,
};
