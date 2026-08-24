'use strict';

const { env } = require('../config/env');
const { langName } = require('./openai_vocab.service');

function splitGlosses(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) return false;
  const msg = String(err.message || err.code || '');
  return /ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|fetch failed|socket|aborted|429|502|503|504/i.test(
    msg,
  );
}

async function fetchWithTimeout(url, options, timeoutMs = 90000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Used only by seed-word-translations.js (offline, not during API requests).
 * Retries on network / rate-limit failures.
 */
async function translateWordsBatch(items, nativeLang, { retries = 5 } = {}) {
  const apiKey = env.openai.apiKey;
  if (!apiKey || !items.length) return [];

  const lang = langName(nativeLang);
  const payload = items.map((item) => ({
    id: item.id,
    word: item.word,
    englishGlosses: item.translateEn,
    englishSentence: item.sentenceEn,
  }));

  const body = JSON.stringify({
    model: env.openai.model,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You translate English vocabulary glosses and example sentences for a language-learning app.
Return ONLY valid JSON:
{"items":[{"id":"word-id","translations":["gloss1","gloss2"],"sentenceTranslation":"..."}]}
Rules:
- translations: 2-4 short glosses in ${lang}
- sentenceTranslation: natural ${lang} translation of the English sentence
- Preserve every input id exactly once`,
      },
      { role: 'user', content: JSON.stringify({ items: payload }) },
    ],
  });

  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
        },
        90000,
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`OpenAI ${res.status}: ${text.slice(0, 180)}`);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          const wait = Math.min(30000, 2000 * 2 ** (attempt - 1));
          console.warn(
            `[translate] retry ${attempt}/${retries} after ${res.status}, wait ${wait}ms`,
          );
          await sleep(wait);
          continue;
        }
        throw err;
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '{}';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (_) {
        return [];
      }

      const out = [];
      for (const raw of Array.isArray(parsed.items) ? parsed.items : []) {
        const id = String(raw.id || '').trim();
        if (!id) continue;
        const translations = Array.isArray(raw.translations)
          ? raw.translations.map((t) => String(t).trim()).filter(Boolean)
          : splitGlosses(raw.translations);
        if (!translations.length) continue;
        out.push({
          id,
          translations,
          sentenceTranslation: String(raw.sentenceTranslation || '').trim(),
        });
      }
      return out;
    } catch (err) {
      lastErr = err;
      if (isRetryableError(err) && attempt < retries) {
        const wait = Math.min(30000, 2000 * 2 ** (attempt - 1));
        console.warn(
          `[translate] retry ${attempt}/${retries}: ${err.message || err.code}; wait ${wait}ms`,
        );
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('translateWordsBatch failed');
}

module.exports = {
  translateWordsBatch,
};
