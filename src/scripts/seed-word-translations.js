'use strict';

/**
 * Fill Word.translate_XX / sentence_XX columns (same shape as translate_tr).
 * Resumes safely: skips rows that already have translate_XX filled.
 * Retries batches on timeout; does not abort the whole language run.
 *
 * Usage:
 *   npm run seed:translations
 *   npm run seed:translations -- --lang=ja
 *   npm run seed:translations -- --lang=ja,fr --batch=12
 */

require('dotenv').config();

const { pool } = require('../config/db');
const { env } = require('../config/env');
const { SEED_LANGUAGES, normalizeLangCode } = require('../utils/locale');
const { nativeFields } = require('../services/word_bank.service');
const { translateWordsBatch } = require('../services/word_translation.service');

const DEFAULT_BATCH = 12;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const out = { langs: [...SEED_LANGUAGES], batch: DEFAULT_BATCH };
  for (const arg of argv) {
    if (arg.startsWith('--lang=')) {
      out.langs = arg
        .slice(7)
        .split(',')
        .map((s) => normalizeLangCode(s.trim()))
        .filter(Boolean);
    } else if (arg.startsWith('--batch=')) {
      out.batch = Math.min(Math.max(Number(arg.slice(8)) || DEFAULT_BATCH, 1), 25);
    }
  }
  return out;
}

async function withDbRetry(fn, label = 'db', retries = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err.message || err.code || '');
      if (!/ETIMEDOUT|ECONNRESET|PROTOCOL_CONNECTION_LOST|ER_LOCK/i.test(msg)) {
        throw err;
      }
      const wait = Math.min(20000, 1500 * 2 ** (attempt - 1));
      console.warn(`[seed:translations] ${label} retry ${attempt}/${retries}: ${msg}; wait ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function loadWords() {
  return withDbRetry(async () => {
    const [rows] = await pool.query(
      `SELECT id, word, translate_en, sentence_en
       FROM Word
       WHERE word IS NOT NULL AND TRIM(word) <> ''
         AND sentence_en IS NOT NULL AND TRIM(sentence_en) <> ''
       ORDER BY word ASC`,
    );
    return rows;
  }, 'loadWords');
}

async function pendingWords(words, nativeLang) {
  const { translateCol } = nativeFields(nativeLang);
  const rows = await withDbRetry(async () => {
    const [r] = await pool.query(
      `SELECT id FROM Word
       WHERE ${translateCol} IS NULL OR TRIM(${translateCol}) = ''`,
    );
    return r;
  }, `pending:${nativeLang}`);
  const missing = new Set(rows.map((r) => r.id));
  return words.filter((w) => missing.has(w.id));
}

async function saveWordColumns(wordId, nativeLang, translations, sentenceTranslation) {
  const { translateCol, sentenceCol } = nativeFields(nativeLang);
  await withDbRetry(async () => {
    await pool.query(
      `UPDATE Word
       SET ${translateCol} = ?, ${sentenceCol} = ?, updatedAt = UTC_TIMESTAMP()
       WHERE id = ?`,
      [translations.join(', '), sentenceTranslation, wordId],
    );
  }, `save:${wordId}`);
}

async function seedLanguage(words, nativeLang, batchSize) {
  const lang = normalizeLangCode(nativeLang);
  const pending = await pendingWords(words, lang);
  if (!pending.length) {
    console.log(`[seed:translations] ${lang}: already complete (${words.length})`);
    return { lang, saved: 0, skipped: words.length };
  }

  console.log(`[seed:translations] ${lang}: ${pending.length} words to fill`);
  let saved = 0;
  let failedBatches = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize);
    const items = chunk.map((row) => ({
      id: row.id,
      word: row.word,
      translateEn: row.translate_en || row.word,
      sentenceEn: row.sentence_en,
    }));

    let translated = [];
    try {
      translated = await translateWordsBatch(items, lang, { retries: 6 });
    } catch (err) {
      failedBatches += 1;
      console.warn(
        `[seed:translations] ${lang}: batch failed at ${i}/${pending.length}: ${err.message}; continuing`,
      );
      await sleep(3000);
      continue;
    }

    const byId = new Map(translated.map((item) => [item.id, item]));

    for (const row of chunk) {
      const item = byId.get(row.id);
      if (!item) {
        console.warn(`[seed:translations] ${lang}: missing translation for "${row.word}"`);
        continue;
      }
      try {
        await saveWordColumns(row.id, lang, item.translations, item.sentenceTranslation);
        saved += 1;
      } catch (err) {
        console.warn(
          `[seed:translations] ${lang}: save failed for "${row.word}": ${err.message}`,
        );
      }
    }

    const done = Math.min(i + batchSize, pending.length);
    console.log(`[seed:translations] ${lang}: ${done}/${pending.length} (${saved} saved)`);
  }

  return {
    lang,
    saved,
    skipped: words.length - pending.length,
    failedBatches,
  };
}

async function main() {
  if (!env.openai.apiKey) {
    console.error('[seed:translations] OPENAI_API_KEY is required');
    process.exit(1);
  }

  const { langs, batch } = parseArgs(process.argv.slice(2));
  const words = await loadWords();
  if (!words.length) {
    console.error('[seed:translations] No words in Word table');
    process.exit(1);
  }

  console.log(`[seed:translations] ${words.length} words × ${langs.join(', ')} (batch ${batch})`);

  const summary = [];
  for (const lang of langs) {
    summary.push(await seedLanguage(words, lang, batch));
  }

  console.log('[seed:translations] done');
  for (const row of summary) {
    console.log(
      `  ${row.lang}: saved ${row.saved}, skipped ${row.skipped}${
        row.failedBatches ? `, failedBatches ${row.failedBatches}` : ''
      }`,
    );
  }

  await pool.end();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[seed:translations] failed:', err.message);
    try {
      await pool.end();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
}
