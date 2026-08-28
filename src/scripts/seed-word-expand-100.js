'use strict';

/**
 * Add 100 NEW lemmas per CEFR level (not already in Word), enrich en/tr/de,
 * then fill ja/fr/es/ru/hi/pt/zh/it via word_translation.service.
 *
 * Usage:
 *   node src/scripts/seed-word-expand-100.js
 *   node src/scripts/seed-word-expand-100.js --level=A1
 *   node src/scripts/seed-word-expand-100.js --per-level=50
 */

require('dotenv').config();

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const { env } = require('../config/env');
const { SEED_LANGUAGES } = require('../utils/locale');
const { nativeFields } = require('../services/word_bank.service');
const { translateWordsBatch } = require('../services/word_translation.service');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_PER_LEVEL = 100;
const GENERATE_CHUNK = 40;
const ENRICH_BATCH = 15;
const TRANS_BATCH = 12;
const MAX_ROUNDS_PER_LEVEL = 80;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const out = { levels: [...LEVELS], perLevel: DEFAULT_PER_LEVEL };
  for (const arg of argv) {
    if (arg.startsWith('--level=')) {
      out.levels = arg
        .slice(8)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((l) => LEVELS.includes(l));
    } else if (arg.startsWith('--per-level=')) {
      out.perLevel = Math.max(1, Number(arg.slice(12)) || DEFAULT_PER_LEVEL);
    }
  }
  return out;
}

async function loadExisting() {
  const [rows] = await pool.query('SELECT LOWER(word) AS w, level FROM Word');
  const all = new Set(rows.map((r) => String(r.w || '').trim().toLowerCase()));
  const byLevel = {};
  for (const l of LEVELS) byLevel[l] = [];
  for (const r of rows) {
    const lv = String(r.level || '').toUpperCase();
    if (byLevel[lv]) byLevel[lv].push(String(r.w));
  }
  return { all, byLevel };
}

async function openaiJson(messages, retries = 4) {
  const apiKey = env.openai.apiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required');

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.openai.model || 'gpt-4o-mini',
          temperature: 0.55,
          response_format: { type: 'json_object' },
          messages,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 280)}`);
      }
      const json = await res.json();
      return JSON.parse(json.choices?.[0]?.message?.content || '{}');
    } catch (err) {
      lastErr = err;
      await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}

async function generateNewLemmas(level, count, excludeSample, round = 1) {
  const excludeLine = excludeSample.slice(0, 200).join(', ');
  const creativity =
    round > 15
      ? 'Prefer less common but still teachable vocabulary; avoid textbook staples.'
      : round > 8
        ? 'Avoid the most frequent beginner words; pick fresher lemmas.'
        : '';
  const parsed = await openaiJson([
    {
      role: 'system',
      content: `You create English vocabulary for a language-learning app (CEFR ${level}).
Return ONLY JSON:
{"items":[{"word":"lemma","translate_en":"English glosses","translate_tr":"Turkish glosses","translate_de":"German glosses","pronunciation_en":"simple phonetic","sentence_en":"natural sentence","sentence_tr":"Turkish sentence","sentence_de":"German sentence"}]}
Rules:
- Provide exactly ${count} items.
- Each "word" is a single lowercase lemma (or common phrasal verb for B2+).
- Must be appropriate for ${level} learners.
- MUST NOT duplicate or closely repeat any word in the exclusion sample.
- Glosses comma-separated; sentences short and natural.
${creativity}`,
    },
    {
      role: 'user',
      content: `Generate ${count} NEW ${level} words NOT in this sample: ${excludeLine}`,
    },
  ]);

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items
    .map((item) => ({
      word: String(item.word || '').trim().toLowerCase(),
      translate_en: String(item.translate_en || '').trim(),
      translate_tr: String(item.translate_tr || '').trim(),
      translate_de: String(item.translate_de || '').trim(),
      pronunciation_en: String(item.pronunciation_en || '').trim(),
      sentence_en: String(item.sentence_en || '').trim(),
      sentence_tr: String(item.sentence_tr || '').trim(),
      sentence_de: String(item.sentence_de || '').trim(),
    }))
    .filter((item) => item.word.length > 0);
}

function fallbackItem(word) {
  return {
    word,
    translate_en: word,
    translate_tr: word,
    translate_de: word,
    pronunciation_en: word,
    sentence_en: `I learned the word "${word}" today.`,
    sentence_tr: `Bugün "${word}" kelimesini öğrendim.`,
    sentence_de: `Ich habe heute das Wort "${word}" gelernt.`,
  };
}

async function enrichBatch(level, words) {
  const parsed = await openaiJson([
    {
      role: 'system',
      content: `You enrich CEFR ${level} English vocabulary for a MySQL Word table.
Return ONLY JSON:
{"items":[{"word":"lemma","translate_en":"English synonyms","translate_tr":"Turkish glosses","translate_de":"German glosses","pronunciation_en":"simple phonetic","sentence_en":"one natural English sentence","sentence_tr":"Turkish sentence","sentence_de":"German sentence"}]}
Include EVERY lemma exactly once.`,
    },
    {
      role: 'user',
      content: `Enrich: ${words.join(', ')}`,
    },
  ]);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const map = new Map();
  for (const item of items) {
    const w = String(item.word || '').trim().toLowerCase();
    if (w) map.set(w, item);
  }
  return map;
}

async function insertWord(level, item) {
  const word = item.word;
  await pool.query(
    `INSERT INTO Word
      (id, word, level, translate_en, translate_tr, translate_de,
       pronunciation_en, sentence_en, sentence_tr, sentence_de, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [
      uuid(),
      word,
      level,
      item.translate_en || word,
      item.translate_tr || word,
      item.translate_de || word,
      item.pronunciation_en || null,
      item.sentence_en || `I use the word "${word}".`,
      item.sentence_tr || `"${word}" kelimesini kullanıyorum.`,
      item.sentence_de || `Ich benutze das Wort "${word}".`,
    ],
  );
}

async function collectForLevel(level, target, exist, levelWords) {
  const collected = [];
  let rounds = 0;
  const rejected = new Set();

  while (collected.length < target && rounds < MAX_ROUNDS_PER_LEVEL) {
    rounds += 1;
    const need = Math.min(GENERATE_CHUNK, target - collected.length);
    const sample = [...levelWords, ...collected.map((c) => c.word), ...rejected]
      .sort(() => Math.random() - 0.5)
      .slice(0, 220);

    let items = [];
    try {
      items = await generateNewLemmas(level, need + 8, sample, rounds);
    } catch (err) {
      console.warn(`[expand] ${level} generate round ${rounds} failed: ${err.message}`);
      await sleep(2000);
      continue;
    }

    let added = 0;
    for (const raw of items) {
      if (collected.length >= target) break;
      const w = raw.word;
      if (!w || exist.has(w) || collected.some((c) => c.word === w)) {
        if (w) rejected.add(w);
        continue;
      }

      const hasEnrich =
        raw.translate_tr && raw.sentence_en && raw.sentence_tr && raw.sentence_de;
      collected.push(hasEnrich ? raw : { ...fallbackItem(w), word: w });
      exist.add(w);
      levelWords.push(w);
      added += 1;
    }

    console.log(
      `[expand] ${level}: ${collected.length}/${target} collected (round ${rounds}, +${added})`,
    );
    await sleep(300);
  }

  if (collected.length < target) {
    throw new Error(
      `${level}: only collected ${collected.length}/${target} unique words`,
    );
  }
  return collected.slice(0, target);
}

async function insertLevel(level, items) {
  let inserted = 0;
  for (let i = 0; i < items.length; i += ENRICH_BATCH) {
    const chunk = items.slice(i, i + ENRICH_BATCH);
    const needsEnrich = chunk.filter(
      (item) =>
        !item.translate_tr ||
        item.translate_tr === item.word ||
        !item.sentence_en,
    );
    if (needsEnrich.length) {
      try {
        const map = await enrichBatch(
          level,
          needsEnrich.map((x) => x.word),
        );
        for (const item of chunk) {
          const enriched = map.get(item.word);
          if (enriched) {
            Object.assign(item, {
              translate_en: enriched.translate_en || item.translate_en,
              translate_tr: enriched.translate_tr || item.translate_tr,
              translate_de: enriched.translate_de || item.translate_de,
              pronunciation_en:
                enriched.pronunciation_en || item.pronunciation_en,
              sentence_en: enriched.sentence_en || item.sentence_en,
              sentence_tr: enriched.sentence_tr || item.sentence_tr,
              sentence_de: enriched.sentence_de || item.sentence_de,
            });
          }
        }
      } catch (err) {
        console.warn(`[expand] ${level} enrich warn: ${err.message}`);
      }
    }

    for (const item of chunk) {
      try {
        await insertWord(level, item);
        inserted += 1;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') continue;
        throw err;
      }
    }
    console.log(
      `[expand] ${level}: inserted ${Math.min(i + chunk.length, items.length)}/${items.length}`,
    );
  }
  return inserted;
}

async function fillTranslationsForIds(wordRows, langs) {
  for (const lang of langs) {
    const { translateCol, sentenceCol } = nativeFields(lang);
    let saved = 0;
    for (let i = 0; i < wordRows.length; i += TRANS_BATCH) {
      const chunk = wordRows.slice(i, i + TRANS_BATCH);
      const items = chunk.map((row) => ({
        id: row.id,
        word: row.word,
        translateEn: row.translate_en || row.word,
        sentenceEn: row.sentence_en,
      }));
      try {
        const translated = await translateWordsBatch(items, lang, { retries: 5 });
        const byId = new Map(translated.map((t) => [t.id, t]));
        for (const row of chunk) {
          const t = byId.get(row.id);
          if (!t) continue;
          await pool.query(
            `UPDATE Word SET ${translateCol} = ?, ${sentenceCol} = ?, updatedAt = UTC_TIMESTAMP() WHERE id = ?`,
            [t.translations.join(', '), t.sentenceTranslation, row.id],
          );
          saved += 1;
        }
      } catch (err) {
        console.warn(`[expand] translations ${lang} batch failed: ${err.message}`);
        await sleep(2500);
      }
      console.log(
        `[expand] ${lang}: ${Math.min(i + chunk.length, wordRows.length)}/${wordRows.length}`,
      );
    }
    console.log(`[expand] ${lang}: saved ${saved}`);
  }
}

async function main() {
  const { levels, perLevel } = parseArgs(process.argv.slice(2));
  const { all: exist, byLevel } = await loadExisting();
  console.log(`[expand] existing=${exist.size}, perLevel=${perLevel}, levels=${levels.join(',')}`);

  const insertedIds = [];

  for (const level of levels) {
    console.log(`\n[expand] === ${level} ===`);
    const items = await collectForLevel(
      level,
      perLevel,
      exist,
      [...(byLevel[level] || [])],
    );
    const n = await insertLevel(level, items);
    console.log(`[expand] ${level}: inserted ${n}`);

    const placeholders = items.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id, word, translate_en, sentence_en FROM Word WHERE word IN (${placeholders})`,
      items.map((x) => x.word),
    );
    insertedIds.push(...rows);

    if (rows.length) {
      console.log(
        `[expand] ${level}: translating ${rows.length} rows (${SEED_LANGUAGES.join(', ')})`,
      );
      await fillTranslationsForIds(rows, SEED_LANGUAGES);
    }
  }

  const [counts] = await pool.query(
    `SELECT level, COUNT(*) AS c FROM Word
     GROUP BY level ORDER BY FIELD(level,'A1','A2','B1','B2','C1','C2')`,
  );
  console.log('\n[expand] done');
  console.table(counts);
  await pool.end();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[expand] failed:', err.message);
    try {
      await pool.end();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
}
