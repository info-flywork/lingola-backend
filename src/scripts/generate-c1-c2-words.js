'use strict';

/**
 * Fill translations/sentences for fixed C1/C2 lemma lists,
 * then write Word_C1_C2.sql in the same INSERT shape as Word.sql.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { env } = require('../config/env');

const ROOT = path.join(__dirname, '../..');
const OUT = path.join(ROOT, 'Word_C1_C2.sql');
const BATCH = 20;

function esc(value) {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function enrichBatch(level, words) {
  const apiKey = env.openai.apiKey;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const system = `You enrich CEFR ${level} English vocabulary for a language DB.
Return ONLY JSON:
{"items":[{"word":"exact lemma","translate_en":"English synonyms","translate_tr":"Turkish glosses","translate_de":"German glosses","pronunciation_en":"simple phonetic","sentence_en":"English sentence using the word","sentence_tr":"Turkish sentence","sentence_de":"German sentence"}]}
Rules:
- Include EVERY provided word exactly once (same spelling).
- Do not invent extra words.
- Glosses comma-separated.
- Sentences must use the target word naturally.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openai.model || 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Enrich these ${level} words: ${words.join(', ')}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const byWord = new Map();
  for (const item of items) {
    const w = String(item.word || '').trim().toLowerCase();
    if (!w) continue;
    byWord.set(w, item);
  }
  return byWord;
}

function rowSql(r) {
  return `(${[
    esc(r.id),
    esc(r.word),
    esc(r.level),
    esc(r.translate_en),
    esc(r.translate_tr),
    esc(r.translate_de),
    esc(r.pronunciation_en),
    'NULL',
    'NULL',
    esc(r.sentence_en),
    esc(r.sentence_tr),
    esc(r.sentence_de),
    esc(r.stamp),
    esc(r.stamp),
  ].join(', ')})`;
}

async function enrichLevel(level, words) {
  const rows = [];
  for (let i = 0; i < words.length; i += BATCH) {
    const chunk = words.slice(i, i + BATCH);
    process.stdout.write(
      `[${level}] ${Math.min(i + chunk.length, words.length)}/${words.length}\n`,
    );
    let map = new Map();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        map = await enrichBatch(level, chunk);
        break;
      } catch (err) {
        console.error(`[${level}] retry ${attempt + 1}:`, err.message);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    const stamp = nowStamp();
    for (const word of chunk) {
      const item = map.get(word) || {};
      rows.push({
        id: crypto.randomUUID(),
        word,
        level,
        translate_en: String(item.translate_en || word).trim(),
        translate_tr: String(item.translate_tr || '').trim() || word,
        translate_de: String(item.translate_de || '').trim() || word,
        pronunciation_en: String(item.pronunciation_en || '').trim() || null,
        sentence_en:
          String(item.sentence_en || '').trim() ||
          `The word "${word}" is useful at ${level} level.`,
        sentence_tr:
          String(item.sentence_tr || '').trim() ||
          `"${word}" kelimesi ${level} seviyesinde önemlidir.`,
        sentence_de:
          String(item.sentence_de || '').trim() ||
          `Das Wort "${word}" ist auf ${level}-Niveau nützlich.`,
        stamp,
      });
    }
  }
  return rows;
}

async function main() {
  const c1 = JSON.parse(fs.readFileSync('/tmp/c1_words.json', 'utf8'));
  const c2 = JSON.parse(fs.readFileSync('/tmp/c2_words.json', 'utf8'));
  if (c1.length !== 250 || c2.length !== 250) {
    throw new Error(`Expected 250/250, got ${c1.length}/${c2.length}`);
  }

  const rows = [
    ...(await enrichLevel('C1', c1)),
    ...(await enrichLevel('C2', c2)),
  ];

  const header = `-- C1/C2 extension for Word table (same schema as Word.sql)
-- C1: 250 | C2: 250 | generated: ${nowStamp()}

INSERT INTO \`Word\` (\`id\`, \`word\`, \`level\`, \`translate_en\`, \`translate_tr\`, \`translate_de\`, \`pronunciation_en\`, \`pronunciation_tr\`, \`pronunciation_de\`, \`sentence_en\`, \`sentence_tr\`, \`sentence_de\`, \`createdAt\`, \`updatedAt\`) VALUES
`;

  fs.writeFileSync(OUT, `${header}${rows.map(rowSql).join(',\n')};\n`, 'utf8');
  console.log(`wrote ${OUT} rows=${rows.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
