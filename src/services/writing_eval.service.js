'use strict';

const { env } = require('../config/env');
const {
  findWordSentenceById,
  textsMatch,
  normalizeText,
} = require('./word_bank.service');

function stripDataUrl(base64) {
  const raw = String(base64 || '');
  const idx = raw.indexOf('base64,');
  return idx >= 0 ? raw.slice(idx + 7) : raw;
}

async function transcribeAudio({ audioBase64, contentType = 'audio/m4a' }) {
  const apiKey = env.openai.apiKey;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const buffer = Buffer.from(stripDataUrl(audioBase64), 'base64');
  if (!buffer.length) {
    const err = new Error('Empty audio payload');
    err.status = 400;
    throw err;
  }

  const ext = contentType.includes('wav')
    ? 'wav'
    : contentType.includes('mpeg') || contentType.includes('mp3')
      ? 'mp3'
      : contentType.includes('webm')
        ? 'webm'
        : 'm4a';

  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: contentType || 'audio/m4a' }),
    `writing.${ext}`,
  );
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Whisper ${res.status}: ${text.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const json = await res.json();
  return String(json.text || '').trim();
}

async function evaluateWritingText({ user, wordId, answer }) {
  const nativeLang = user.onboarding?.nativeLanguageCode || 'tr';
  const row = await findWordSentenceById(wordId, nativeLang);
  if (!row || !row.sentence_en) {
    const err = new Error('Writing prompt not found');
    err.status = 404;
    throw err;
  }

  const expected = row.sentence_en;
  const matched = textsMatch(answer, expected);
  return {
    matched,
    expected,
    transcript: String(answer || '').trim(),
    normalizedExpected: normalizeText(expected),
    normalizedAnswer: normalizeText(answer),
  };
}

async function evaluateWritingAudio({
  user,
  wordId,
  audioBase64,
  contentType,
}) {
  const nativeLang = user.onboarding?.nativeLanguageCode || 'tr';
  const row = await findWordSentenceById(wordId, nativeLang);
  if (!row || !row.sentence_en) {
    const err = new Error('Writing prompt not found');
    err.status = 404;
    throw err;
  }

  const transcript = await transcribeAudio({ audioBase64, contentType });
  const expected = row.sentence_en;
  const matched = textsMatch(transcript, expected);
  return {
    matched,
    expected,
    transcript,
    normalizedExpected: normalizeText(expected),
    normalizedAnswer: normalizeText(transcript),
  };
}

module.exports = {
  evaluateWritingText,
  evaluateWritingAudio,
  transcribeAudio,
};
