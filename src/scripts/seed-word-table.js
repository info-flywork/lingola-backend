'use strict';

/**
 * Insert 100 Word rows per CEFR level that are not already in the remote Word table.
 * Uses existing DB_* env. OpenAI fills translations/sentences when available.
 */

require('dotenv').config();
const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const { env } = require('../config/env');
const CANDIDATES = require('../data/word-bank-extra');

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PER_LEVEL = 100;
const BATCH = 15;

function fallbackItem(word, level) {
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
  const apiKey = env.openai.apiKey;
  if (!apiKey) {
    return new Map(words.map((w) => [w, fallbackItem(w, level)]));
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openai.model || 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You enrich CEFR ${level} English vocabulary for a MySQL Word table.
Return ONLY JSON:
{"items":[{"word":"lemma","translate_en":"English synonyms","translate_tr":"Turkish glosses","translate_de":"German glosses","pronunciation_en":"simple phonetic like prity","sentence_en":"one natural English sentence using the word","sentence_tr":"Turkish translation of that sentence","sentence_de":"German translation of that sentence"}]}
Rules: include EVERY lemma exactly once; glosses comma-separated; keep sentences short.`,
        },
        {
          role: 'user',
          content: `Enrich these ${level} words: ${words.join(', ')}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 240)}`);
  }
  const json = await res.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const map = new Map();
  for (const item of items) {
    const w = String(item.word || '').trim().toLowerCase();
    if (!w) continue;
    map.set(w, item);
  }
  return map;
}

async function existingSet() {
  const [rows] = await pool.query('SELECT LOWER(word) AS w FROM Word');
  return new Set(rows.map((r) => String(r.w || '').trim().toLowerCase()));
}

function pickMissing(exist, level) {
  const out = [];
  const seen = new Set();
  for (const raw of CANDIDATES[level] || []) {
    const w = String(raw).trim().toLowerCase();
    if (!w || exist.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= PER_LEVEL) break;
  }
  return out;
}

async function insertRows(level, lemmas) {
  let inserted = 0;
  for (let i = 0; i < lemmas.length; i += BATCH) {
    const chunk = lemmas.slice(i, i + BATCH);
    process.stdout.write(`[${level}] ${Math.min(i + chunk.length, lemmas.length)}/${lemmas.length}\n`);
    let map = new Map();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        map = await enrichBatch(level, chunk);
        break;
      } catch (err) {
        console.error(`[${level}] enrich retry ${attempt + 1}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }

    for (const word of chunk) {
      const item = map.get(word) || fallbackItem(word, level);
      try {
        await pool.query(
          `INSERT INTO Word
            (id, word, level, translate_en, translate_tr, translate_de,
             pronunciation_en, pronunciation_tr, pronunciation_de,
             sentence_en, sentence_tr, sentence_de, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [
            uuid(),
            word,
            level,
            String(item.translate_en || word).trim(),
            String(item.translate_tr || word).trim(),
            String(item.translate_de || word).trim(),
            String(item.pronunciation_en || '').trim() || null,
            String(item.sentence_en || '').trim() || `I use the word "${word}".`,
            String(item.sentence_tr || '').trim() || `"${word}" kelimesini kullanıyorum.`,
            String(item.sentence_de || '').trim() || `Ich benutze das Wort "${word}".`,
          ],
        );
        inserted += 1;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') continue;
        throw err;
      }
    }
  }
  return inserted;
}

async function main() {
  const exist = await existingSet();
  console.log(`[seed:words] existing=${exist.size}`);

  const summary = [];
  for (const level of LEVELS) {
    const lemmas = pickMissing(exist, level);
    if (lemmas.length < PER_LEVEL) {
      throw new Error(
        `${level}: only ${lemmas.length} unused candidates (need ${PER_LEVEL}). Add more lemmas.`,
      );
    }
    for (const w of lemmas) exist.add(w);
    const n = await insertRows(level, lemmas);
    summary.push({ level, inserted: n });
  }

  const [counts] = await pool.query(
    `SELECT level, COUNT(*) AS c FROM Word
     GROUP BY level
     ORDER BY FIELD(level,'A1','A2','B1','B2','C1','C2')`,
  );
  console.log('[seed:words] inserted', summary);
  console.table(counts);
  await pool.end();
}

main().catch((err) => {
  console.error('[seed:words] failed:', err.message);
  process.exit(1);
});
