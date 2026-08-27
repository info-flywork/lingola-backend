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

function evaluateTranscript(transcript, keywords = []) {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) {
    return { matched: false, transcript: normalized };
  }
  const matched = keywords.some((keyword) =>
    normalized.includes(String(keyword || '').toLowerCase()),
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
