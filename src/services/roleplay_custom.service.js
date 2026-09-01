'use strict';

const { pool } = require('../config/db');
const { env } = require('../config/env');
const { uuid } = require('../utils/auth');

function requireOpenAi() {
  const apiKey = env.openai.apiKey;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  return apiKey;
}

function parseJsonFromContent(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : text;
  return JSON.parse(body);
}

async function callScenarioJson(prompt, nativeLanguageCode) {
  const apiKey = requireOpenAi();
  const native = nativeLanguageCode || 'tr';
  const system = `You design English role-play lessons for the Lingola app.
Return ONLY valid JSON (no markdown) with this shape:
{
  "title": "short English scene title",
  "screenplay": "2-3 sentences describing what the learner will practice",
  "openingMessage": "Friendly English tutor briefing (2-3 sentences, ends asking if ready)",
  "roleATutor": "tutor role phase 2",
  "roleAUser": "learner role phase 2",
  "roleBTutor": "tutor role phase 3 after switch",
  "roleBUser": "learner role phase 3 after switch",
  "phrases": ["8-14 natural English phrases"],
  "rolePlayChecks": ["3-6 real-life details to cover in the scene"],
  "imagePrompt": "flat colorful mobile app illustration, friendly cartoon style, no text, square composition"
}
Keep language A2-B1, everyday spoken English.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openai.model || 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Learner native language: ${native}.
Scenario idea: ${prompt}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`OpenAI scenario generation failed: ${errText.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseJsonFromContent(content);
  if (!parsed?.title || !parsed?.screenplay || !parsed?.openingMessage) {
    const err = new Error('Invalid scenario generation payload');
    err.status = 502;
    throw err;
  }
  return parsed;
}

async function generateScenarioImage(imagePrompt) {
  try {
    const apiKey = requireOpenAi();
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: String(imagePrompt || 'friendly flat illustration for language learning app'),
        size: '1024x1024',
        n: 1,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.url || null;
  } catch (_) {
    return null;
  }
}

function rowToApi(row) {
  let payload = {};
  try {
    payload =
      typeof row.prompt_payload === 'string'
        ? JSON.parse(row.prompt_payload)
        : row.prompt_payload || {};
  } catch (_) {
    payload = {};
  }

  return {
    id: row.id,
    titleKey: 'custom',
    title: row.title,
    screenplay: row.screenplay,
    openingMessage: row.opening_message,
    imageAsset: row.image_url || '',
    sectionKey: 'custom',
    minutes: Number(row.minutes) || 8,
    levelKey: row.level_key || 'beginner',
    sortOrder: Number(row.sort_order) || 1000,
    isCustom: true,
    promptPayload: payload,
  };
}

async function listCustomForUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, title, screenplay, opening_message, prompt_payload, image_url,
            minutes, level_key, sort_order
     FROM user_roleplay_scenarios
     WHERE user_id = ?
     ORDER BY sort_order ASC, created_at DESC`,
    [userId],
  );
  return rows.map(rowToApi);
}

async function fetchCustomById(userId, scenarioId) {
  const [rows] = await pool.query(
    `SELECT id, title, screenplay, opening_message, prompt_payload, image_url,
            minutes, level_key, sort_order
     FROM user_roleplay_scenarios
     WHERE user_id = ? AND id = ?
     LIMIT 1`,
    [userId, scenarioId],
  );
  if (!rows.length) return null;
  return rowToApi(rows[0]);
}

async function createCustomScenario(userId, { prompt, nativeLanguageCode, levelKey }) {
  const idea = String(prompt || '').trim();
  if (idea.length < 8) {
    const err = new Error('prompt must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  if (idea.length > 600) {
    const err = new Error('prompt is too long');
    err.status = 400;
    throw err;
  }

  const generated = await callScenarioJson(idea, nativeLanguageCode);
  const imageUrl = await generateScenarioImage(generated.imagePrompt);

  const id = uuid();
  const payload = {
    title: generated.title,
    roleATutor: generated.roleATutor,
    roleAUser: generated.roleAUser,
    roleBTutor: generated.roleBTutor,
    roleBUser: generated.roleBUser,
    phrases: Array.isArray(generated.phrases) ? generated.phrases : [],
    rolePlayChecks: Array.isArray(generated.rolePlayChecks)
      ? generated.rolePlayChecks
      : [],
  };

  await pool.query(
    `INSERT INTO user_roleplay_scenarios
       (id, user_id, title, screenplay, opening_message, prompt_payload, image_url, level_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      generated.title,
      generated.screenplay,
      generated.openingMessage,
      JSON.stringify(payload),
      imageUrl,
      levelKey || 'beginner',
    ],
  );

  return fetchCustomById(userId, id);
}

module.exports = {
  createCustomScenario,
  listCustomForUser,
  fetchCustomById,
  rowToApi,
};
