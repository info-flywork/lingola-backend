'use strict';

const { env } = require('../config/env');

const GOAL_LABELS = {
  career: 'career / professional development',
  travel: 'travel / airports / hotels / sightseeing',
  livingAbroad: 'living abroad / daily life / bureaucracy / housing',
  studyingAbroad: 'studying abroad / campus / courses / exams',
  other: 'everyday general English',
  general: 'everyday general English',
};

const LANG_NAMES = {
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  pt: 'Portuguese',
  ko: 'Korean',
  zh: 'Chinese',
  ja: 'Japanese',
  jp: 'Japanese',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
};

function langName(code) {
  const c = (code || 'en').toLowerCase().split(/[-_]/)[0];
  return LANG_NAMES[c] || c;
}

function normalizeGoalTag(goal) {
  if (!goal || goal === 'other') return 'general';
  return String(goal);
}

/**
 * Ask OpenAI for fresh vocabulary cards. Caller must pass excludeWords so we
 * never regenerate something already in our bank.
 */
async function generateVocabularyBatch({
  count,
  targetLang = 'en',
  nativeLang = 'tr',
  level = 'beginner',
  goalTag = 'general',
  excludeWords = [],
}) {
  const apiKey = env.openai.apiKey;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const n = Math.min(Math.max(Number(count) || 1, 1), 10);
  const themed = goalTag && goalTag !== 'general';
  const theme = GOAL_LABELS[goalTag] || GOAL_LABELS.general;
  const exclude = excludeWords
    .map((w) => String(w || '').trim())
    .filter(Boolean)
    .slice(0, 80);

  const system = `You are a vocabulary author for a language-learning app.
Return ONLY valid JSON matching this schema:
{"items":[{"word":"string","phonetic":"IPA or empty","translation":"string in native language","sentence":"natural example in target language using the word","sentenceTranslation":"translation of the sentence in native language","goalTag":"${themed ? goalTag : 'general'}"}]}
Rules:
- Target language words only (${langName(targetLang)}).
- Difficulty: ${level} (beginner≈A1-A2, intermediate≈B1-B2, advanced≈C1).
- Translations and sentenceTranslation MUST be in ${langName(nativeLang)}.
- Prefer single words or short useful phrases (max 3 words).
- No duplicates within the batch.
- Do not invent ultra-rare jargon; keep it useful and teachable.
- sentence must clearly contain/use the word.`;

  const user = themed
    ? `Generate ${n} ${level} ${langName(targetLang)} vocabulary items themed around: ${theme}.
Avoid these existing words: ${exclude.length ? exclude.join(', ') : '(none)'}.`
    : `Generate ${n} ${level} general-purpose ${langName(targetLang)} vocabulary items (NOT specifically about travel/career/study).
Avoid these existing words: ${exclude.length ? exclude.join(', ') : '(none)'}.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openai.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${text.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    const err = new Error('OpenAI returned invalid JSON');
    err.status = 502;
    throw err;
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const out = [];
  const seen = new Set();
  for (const raw of items) {
    const word = String(raw.word || '').trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    if (exclude.some((w) => w.toLowerCase() === key)) continue;
    seen.add(key);
    out.push({
      word,
      phonetic: String(raw.phonetic || '').trim() || null,
      translation: String(raw.translation || '').trim(),
      sentence: String(raw.sentence || '').trim(),
      sentenceTranslation: String(raw.sentenceTranslation || '').trim(),
      goalTag: themed ? goalTag : 'general',
      level,
      targetLang,
      nativeLang,
    });
    if (out.length >= n) break;
  }
  return out;
}

module.exports = {
  generateVocabularyBatch,
  normalizeGoalTag,
  GOAL_LABELS,
  langName,
};
