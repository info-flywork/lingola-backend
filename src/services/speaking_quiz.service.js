'use strict';

const fs = require('fs');
const path = require('path');

const PROMPTS_PATH = path.join(__dirname, '../data/speaking-prompts.json');

function loadPrompts() {
  const raw = fs.readFileSync(PROMPTS_PATH, 'utf8');
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) return [];
  return rows;
}

function normalizeTranscript(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityRatio(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  let distance = 0;
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  distance = matrix[a.length][b.length];
  return 1 - distance / maxLen;
}

function keywordMatches(normalized, keyword) {
  const k = normalizeTranscript(keyword);
  if (!k) return false;
  if (normalized.includes(k)) return true;
  if (similarityRatio(normalized, k) >= 0.85) return true;
  const words = normalized.split(' ').filter(Boolean);
  return words.some((word) => similarityRatio(word, k) >= 0.85);
}

function evaluateTranscript(transcript, keywords = []) {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) {
    return { matched: false, transcript: normalized };
  }
  const matched = keywords.some((keyword) =>
    keywordMatches(normalized, keyword),
  );
  return { matched, transcript: normalized };
}

function listPrompts({ count = 6 } = {}) {
  const limit = Math.max(1, Math.min(Number(count) || 6, 20));
  return loadPrompts().slice(0, limit).map((row) => ({
    id: row.id,
    promptEn: row.promptEn,
    promptNative: row.promptNative,
    exampleAnswerEn: row.exampleAnswerEn || '',
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    sortOrder: row.sortOrder ?? 0,
  }));
}

function findPromptById(promptId) {
  return loadPrompts().find((row) => row.id === promptId) || null;
}

function evaluatePrompt({ promptId, transcript }) {
  const prompt = findPromptById(promptId);
  if (!prompt) {
    const err = new Error('Prompt not found');
    err.status = 404;
    throw err;
  }
  const result = evaluateTranscript(transcript, prompt.keywords);
  return {
    matched: result.matched,
    transcript: result.transcript,
    promptId: prompt.id,
    promptEn: prompt.promptEn,
  };
}

module.exports = {
  listPrompts,
  evaluatePrompt,
  evaluateTranscript,
};
