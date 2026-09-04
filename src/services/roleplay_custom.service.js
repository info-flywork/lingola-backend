'use strict';

const { pool } = require('../config/db');
const { env } = require('../config/env');
const { uuid } = require('../utils/auth');
const { uploadBuffer } = require('./bunny.service');

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

async function callScenarioJson(input, nativeLanguageCode) {
  const apiKey = requireOpenAi();
  const native = nativeLanguageCode || 'tr';
  const {
    scenario,
    tutorRole,
    userRole,
    extraInfo,
    prompt,
    levelKey,
  } = input;

  const levelGuide = {
    beginner: 'CEFR A1 — very simple words, short sentences, slow clear speech.',
    easy: 'CEFR A2 — simple everyday English, common phrases.',
    medium: 'CEFR B1 — natural conversational English, some nuance.',
    hard: 'CEFR B2 — richer vocabulary, idioms, faster natural speech.',
  }[String(levelKey || 'beginner')] || 'CEFR A2-B1 — everyday spoken English.';

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
  "imagePrompt": "one specific visual of THIS scene only, unique setting and characters, not a generic cafe"
}
Target difficulty: ${levelGuide}
Honor the learner-provided scenario and roles closely.`;

  const userLines = [
    `Learner native language: ${native}.`,
    `Difficulty level: ${levelKey || 'beginner'}.`,
    scenario ? `Scenario: ${scenario}` : null,
    tutorRole ? `Tutor should play: ${tutorRole}` : null,
    userRole ? `Learner should play: ${userRole}` : null,
    extraInfo ? `Extra context: ${extraInfo}` : null,
    prompt ? `Additional notes: ${prompt}` : null,
  ].filter(Boolean);

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
          content: userLines.join('\n'),
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

function buildImagePrompt(generated, input) {
  const title = String(generated.title || input.scenario || '').trim();
  const scene = String(generated.screenplay || input.scenario || '').trim();
  const tutor = String(generated.roleATutor || input.tutorRole || 'tutor').trim();
  const learner = String(generated.roleAUser || input.userRole || 'learner').trim();
  const extra = String(generated.imagePrompt || input.extraInfo || '').trim();
  return [
    'Bright colorful cartoon illustration for a language-learning app card.',
    `Unique scene: ${title}. ${scene}`,
    `Show ${tutor} interacting with ${learner} in this exact situation.`,
    extra ? `Visual details: ${extra}` : '',
    'Vivid colors, square 1:1 crop, friendly characters, clear setting.',
    'No text, no letters, no logos, no watermarks, no UI chrome.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 3500);
}

async function requestImageGeneration(apiKey, body) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenAI image generation failed: ${raw.slice(0, 280)}`);
    err.status = 502;
    throw err;
  }
  return JSON.parse(raw);
}

async function bufferFromImageResponse(data) {
  const item = data?.data?.[0];
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) {
      const err = new Error('OpenAI image download failed');
      err.status = 502;
      throw err;
    }
    return Buffer.from(await imgRes.arrayBuffer());
  }
  const err = new Error('OpenAI image payload missing');
  err.status = 502;
  throw err;
}

async function generateScenarioImageBuffer(imagePrompt) {
  const apiKey = requireOpenAi();
  const prompt = String(
    imagePrompt || 'friendly colorful cartoon illustration for a language app, no text',
  );

  try {
    const data = await requestImageGeneration(apiKey, {
      model: 'gpt-image-1',
      prompt,
      size: '1024x1024',
    });
    return bufferFromImageResponse(data);
  } catch (firstErr) {
    console.warn('[roleplay] gpt-image-1 failed, trying dall-e-3:', firstErr.message);
    const data = await requestImageGeneration(apiKey, {
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });
    return bufferFromImageResponse(data);
  }
}

async function persistScenarioImage(userId, scenarioId, buffer) {
  return uploadBuffer(
    `roleplay/custom/${userId}/${scenarioId}.png`,
    buffer,
    'image/png',
  );
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
    sectionKey: 'lingolaRolePlay',
    categoryKey: 'lingolaRolePlay',
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

async function createCustomScenario(
  userId,
  { scenario, tutorRole, userRole, extraInfo, prompt, nativeLanguageCode, levelKey },
) {
  const scene = String(scenario || prompt || '').trim();
  const tutor = String(tutorRole || '').trim();
  const learner = String(userRole || '').trim();
  const extra = String(extraInfo || '').trim();

  if (scene.length < 2) {
    const err = new Error('scenario must be at least 2 characters');
    err.status = 400;
    throw err;
  }
  if (tutor.length < 2 || learner.length < 2) {
    const err = new Error('tutorRole and userRole are required');
    err.status = 400;
    throw err;
  }
  if (scene.length > 200 || tutor.length > 120 || learner.length > 120) {
    const err = new Error('input is too long');
    err.status = 400;
    throw err;
  }
  if (extra.length > 600) {
    const err = new Error('extraInfo is too long');
    err.status = 400;
    throw err;
  }

  const generated = await callScenarioJson(
    {
      scenario: scene,
      tutorRole: tutor,
      userRole: learner,
      extraInfo: extra,
      levelKey: levelKey || 'beginner',
    },
    nativeLanguageCode,
  );

  const id = uuid();
  const imagePrompt = buildImagePrompt(generated, {
    scenario: scene,
    tutorRole: tutor,
    userRole: learner,
    extraInfo: extra,
  });
  const imageBuffer = await generateScenarioImageBuffer(imagePrompt);
  const imageUrl = await persistScenarioImage(userId, id, imageBuffer);

  const payload = {
    title: generated.title,
    userInput: {
      scenario: scene,
      tutorRole: tutor,
      userRole: learner,
      extraInfo: extra || null,
    },
    roleATutor: generated.roleATutor || tutor,
    roleAUser: generated.roleAUser || learner,
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

async function deleteCustomScenario(userId, scenarioId) {
  const id = String(scenarioId || '').trim();
  if (!id) {
    const err = new Error('scenarioId is required');
    err.status = 400;
    throw err;
  }

  const existing = await fetchCustomById(userId, id);
  if (!existing) {
    const err = new Error('Scenario not found');
    err.status = 404;
    throw err;
  }

  await pool.query(
    `DELETE FROM roleplay_progress
     WHERE user_id = ? AND scenario_id = ?`,
    [userId, id],
  );
  await pool.query(
    `DELETE FROM user_roleplay_scenarios
     WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return true;
}

module.exports = {
  createCustomScenario,
  deleteCustomScenario,
  listCustomForUser,
  fetchCustomById,
  rowToApi,
};
