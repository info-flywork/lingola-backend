'use strict';

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const { env } = require('../config/env');
const { mapTutor } = require('./tutor.service');

async function findTutorById(tutorId) {
  const [rows] = await pool.query(
    'SELECT * FROM tutors WHERE id = ? AND is_active = 1 LIMIT 1',
    [tutorId],
  );
  return rows[0] ? mapTutor(rows[0]) : null;
}

async function findTutorBySlug(slug) {
  const [rows] = await pool.query(
    'SELECT * FROM tutors WHERE slug = ? AND is_active = 1 LIMIT 1',
    [slug],
  );
  return rows[0] ? mapTutor(rows[0]) : null;
}

async function resolveTutor({ tutorId, tutorSlug }) {
  if (tutorId) {
    const tutor = await findTutorById(tutorId);
    if (tutor) return tutor;
  }
  if (tutorSlug) {
    const tutor = await findTutorBySlug(String(tutorSlug).trim().toLowerCase());
    if (tutor) return tutor;
  }
  const err = new Error('Tutor not found');
  err.status = 404;
  throw err;
}

async function getOrCreateSession(userId, { tutorId, tutorSlug } = {}) {
  const tutor = await resolveTutor({ tutorId, tutorSlug });
  tutorId = tutor.id;

  const [existing] = await pool.query(
    `SELECT * FROM tutor_chat_sessions
     WHERE user_id = ? AND tutor_id = ?
     ORDER BY COALESCE(last_message_at, created_at) DESC
     LIMIT 1`,
    [userId, tutorId],
  );

  if (existing.length) {
    return { session: mapSession(existing[0]), tutor, created: false };
  }

  const id = uuid();
  await pool.query(
    `INSERT INTO tutor_chat_sessions (id, user_id, tutor_id, title)
     VALUES (?, ?, ?, ?)`,
    [id, userId, tutorId, tutor.nameKey || tutor.slug],
  );
  const [rows] = await pool.query(
    'SELECT * FROM tutor_chat_sessions WHERE id = ? LIMIT 1',
    [id],
  );
  return { session: mapSession(rows[0]), tutor, created: true };
}

function mapSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    tutorId: row.tutor_id,
    title: row.title,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

async function listSessionsForUser(userId, { limit = 30 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const [rows] = await pool.query(
    `SELECT
       s.*,
       t.slug AS tutor_slug,
       t.name_key AS tutor_name_key,
       t.image_cdn_url AS tutor_image_cdn_url,
       t.local_image_path AS tutor_local_image_path,
       (
         SELECT content FROM tutor_chat_messages m
         WHERE m.session_id = s.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS preview
     FROM tutor_chat_sessions s
     INNER JOIN tutors t ON t.id = s.tutor_id
     WHERE s.user_id = ?
     ORDER BY COALESCE(s.last_message_at, s.created_at) DESC
     LIMIT ?`,
    [userId, take],
  );

  return rows.map((row) => ({
    ...mapSession(row),
    preview: row.preview || '',
    tutor: {
      id: row.tutor_id,
      slug: row.tutor_slug,
      nameKey: row.tutor_name_key,
      imageCdnUrl: row.tutor_image_cdn_url,
      localImagePath: row.tutor_local_image_path,
    },
  }));
}

async function listMessages(sessionId, userId) {
  const session = await assertSessionOwner(sessionId, userId);
  const [rows] = await pool.query(
    `SELECT * FROM tutor_chat_messages
     WHERE session_id = ?
     ORDER BY created_at ASC
     LIMIT 200`,
    [sessionId],
  );
  return {
    session,
    messages: rows.map(mapMessage),
  };
}

async function assertSessionOwner(sessionId, userId) {
  const [rows] = await pool.query(
    'SELECT * FROM tutor_chat_sessions WHERE id = ? AND user_id = ? LIMIT 1',
    [sessionId, userId],
  );
  if (!rows.length) {
    const err = new Error('Chat session not found');
    err.status = 404;
    throw err;
  }
  return mapSession(rows[0]);
}

async function insertMessage({ sessionId, role, content }) {
  const id = uuid();
  await pool.query(
    `INSERT INTO tutor_chat_messages (id, session_id, role, content)
     VALUES (?, ?, ?, ?)`,
    [id, sessionId, role, content],
  );
  await pool.query(
    `UPDATE tutor_chat_sessions
     SET last_message_at = UTC_TIMESTAMP(3)
     WHERE id = ?`,
    [sessionId],
  );
  return {
    id,
    sessionId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function displayTutorName(tutor) {
  const raw = String(tutor.nameKey || tutor.slug || 'Tutor');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function tutorSystemPrompt(tutor) {
  const name = displayTutorName(tutor);
  return `You are ${name}, a friendly English tutor inside the Lingola language-learning app.
Rules:
- Stay in character as ${name}.
- Speak simple clear English (A1–B1 unless the learner writes more advanced English).
- Keep replies short: 1–3 sentences.
- Gently correct mistakes by modeling a better phrase.
- Ask one short follow-up question to keep practice going.
- No markdown, no bullet lists.`;
}

async function callOpenAi({ system, history, userMessage }) {
  const apiKey = env.openai.apiKey;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const messages = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openai.model || 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 180,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${text.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    const err = new Error('OpenAI returned empty reply');
    err.status = 502;
    throw err;
  }
  return String(content).trim();
}

async function sendMessage({ userId, sessionId, content }) {
  const text = String(content || '').trim();
  if (!text) {
    const err = new Error('Message content is required');
    err.status = 400;
    throw err;
  }

  const session = await assertSessionOwner(sessionId, userId);
  const tutor = await findTutorById(session.tutorId);
  if (!tutor) {
    const err = new Error('Tutor not found');
    err.status = 404;
    throw err;
  }

  const userMsg = await insertMessage({
    sessionId,
    role: 'user',
    content: text,
  });

  const { messages: history } = await listMessages(sessionId, userId);
  const prior = history
    .filter((m) => m.id !== userMsg.id && m.role !== 'system')
    .slice(-16);

  let replyText;
  try {
    replyText = await callOpenAi({
      system: tutorSystemPrompt(tutor),
      history: prior,
      userMessage: text,
    });
  } catch (err) {
    // Keep user message even if AI fails; surface error to client.
    throw err;
  }

  const assistantMsg = await insertMessage({
    sessionId,
    role: 'assistant',
    content: replyText,
  });

  return {
    session,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
  };
}

module.exports = {
  getOrCreateSession,
  listSessionsForUser,
  listMessages,
  sendMessage,
  findTutorById,
};
