'use strict';

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const { env } = require('../config/env');
const { mapTutor } = require('./tutor.service');
const streak = require('./streak.service');
const {
  characterBlurb,
  characterLockRule,
  flavorRule,
  naturalEnglishRule,
  lessonTimingRule,
  inCharacterReactionRule,
} = require('./tutor-personality');
const { rolePlaySystemPrompt, parseCustomScenarioId } = require('./roleplay-prompt');
const { fetchCustomById } = require('./roleplay_custom.service');
const { findUserById } = require('./auth.service');
const {
  learnerAddressingRule,
  goalContext,
  learnerPersonalizationContext,
  topicTeachingHints,
  lessonPedagogyRules,
  explanationLanguageRule,
  resolveExplanationLanguage,
} = require('./prompt_helpers');
const {
  normalizeLangCode,
  languageDisplayName,
} = require('../utils/locale');

const PREVIEW_TTL_MS = 1000 * 60 * 30;
const previewSessions = new Map();

function prunePreviewSessions() {
  const now = Date.now();
  for (const [id, session] of previewSessions.entries()) {
    if (session.expiresAt <= now) previewSessions.delete(id);
  }
}

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

async function getOrCreateSession(
  userId,
  {
    tutorId,
    tutorSlug,
    forceNew = false,
    title,
    openingMessage,
    lessonSlug,
    kind = 'chat',
  } = {},
) {
  const tutor = await resolveTutor({ tutorId, tutorSlug });
  tutorId = tutor.id;
  const sessionKind = ['chat', 'lesson', 'practice'].includes(kind)
    ? kind
    : 'chat';

  if (!forceNew) {
    if (title && String(title).trim()) {
      const [byTitle] = await pool.query(
        `SELECT * FROM tutor_chat_sessions
         WHERE user_id = ? AND tutor_id = ? AND title = ?
         ORDER BY COALESCE(last_message_at, created_at) DESC
         LIMIT 1`,
        [userId, tutorId, String(title).trim()],
      );
      if (byTitle.length) {
        return { session: mapSession(byTitle[0]), tutor, created: false };
      }
    }

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
  }

  const id = uuid();
  const sessionTitle =
    (title && String(title).trim()) || tutor.nameKey || tutor.slug;
  await pool.query(
    `INSERT INTO tutor_chat_sessions
       (id, user_id, tutor_id, title, lesson_slug, kind)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, tutorId, sessionTitle, lessonSlug || null, sessionKind],
  );

  const opening = openingMessage && String(openingMessage).trim();
  if (opening) {
    await insertMessage({
      sessionId: id,
      role: 'assistant',
      content: opening,
    });
  }

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
    lessonSlug: row.lesson_slug || null,
    kind: row.kind || 'chat',
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

async function deleteSession(sessionId, userId) {
  await assertSessionOwner(sessionId, userId);
  await pool.query('DELETE FROM tutor_chat_messages WHERE session_id = ?', [
    sessionId,
  ]);
  await pool.query(
    'DELETE FROM tutor_chat_sessions WHERE id = ? AND user_id = ?',
    [sessionId, userId],
  );
  return { deleted: true, sessionId };
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

function demoOnboardingSystemPrompt(tutor, session) {
  const nativeCode = normalizeLangCode(session?.nativeLanguageCode, 'tr');
  const targetCode = normalizeLangCode(session?.targetLanguageCode, 'en');
  const nativeName = languageDisplayName(nativeCode, nativeCode);
  const targetName = languageDisplayName(targetCode, targetCode);

  return `You are Lingola, a friendly robot AI tutor in the Lingola app.
${characterBlurb(tutor)}
${characterLockRule(tutor)}
${flavorRule(tutor)}
${naturalEnglishRule('A1')}
This is a short onboarding DEMO chat after sign-up and setup questions — before the account is fully created.
Learner native language: ${nativeName} (${nativeCode}).
Target language they are learning: ${targetName} (${targetCode}).

The opening message already:
- Introduced you as their AI tutor
- Asked whether they want to continue in ${targetName} or prefer ${nativeName} if something is unclear
- Asked how they are and whether they work or are a student

Rules:
- Stay in character as a curious, warm Lingola robot only.
- If the learner says they do NOT want ${targetName}, do not understand, or writes in ${nativeName}, switch to ${nativeName} for ALL following replies until they ask for ${targetName} again.
- If they are fine with ${targetName}, use simple A1 ${targetName} but check comprehension gently.
- Continue the getting-to-know-you flow: wellbeing, work vs student, one natural follow-up (field of work, what they study, etc.).
- Remember details they share (job, student status, mood) — you will use this to personalize their plan later.
- Keep replies short: 1–3 sentences. One question at a time.
- Reassure them: any level is fine, no pressure, no judgment.
- No markdown, no bullet lists.`;
}

function previewOnboardingSystemPrompt(tutor, session) {
  const nativeCode = normalizeLangCode(session?.nativeLanguageCode, 'tr');
  const targetCode = normalizeLangCode(session?.targetLanguageCode, 'en');
  const nativeName = languageDisplayName(nativeCode, nativeCode);
  const targetName = languageDisplayName(targetCode, targetCode);
  const explainRule = explanationLanguageRule(null, session);
  const explainInNative = resolveExplanationLanguage(null, session) === 'native';

  const practiceRule = explainInNative
    ? `- When teaching ${targetName} phrases, show 2–3 short examples in ${targetName}, but wrap them in ${nativeName} explanation.
- Put each ${targetName} example word or phrase in single quotes (e.g. 'Hi', 'Hello') so pronunciation is clear.
- If the learner comments in ${nativeName} (e.g. "bence hey daha iyi"), respond in ${nativeName} first — acknowledge their point, then suggest the natural ${targetName} phrase.
- Do NOT switch to all-${targetName} replies just because the lesson is about English.`
    : `- CRITICAL: The learner chose English-only explanations for this preview.
- Every reply must be 100% in ${targetName} — no ${nativeName} words or sentences.
- For ${targetName} practice, use simple A1 spoken English with 2–3 natural variants (e.g. Hi / Hey / Hello).
- After the first exchange, continue entirely in ${targetName}.
- Gently correct by modeling natural spoken ${targetName}.`;

  const openingNote = explainInNative
    ? `The first message was already sent in ${nativeName} — welcome, reassurance, and a first greeting in ${targetName}.`
    : `The first message was already sent entirely in ${targetName} — welcome, reassurance, and a first greeting. The learner chose English-only explanations.`;

  return `You are Lingola, a friendly robot English tutor in the Lingola app.
${characterBlurb(tutor)}
${characterLockRule(tutor)}
${flavorRule(tutor)}
${naturalEnglishRule('A1')}
This is a short onboarding preview before sign-up. The learner is trying Lingola for the first time.
Learner native language: ${nativeName} (${nativeCode}).
Target language they are learning: ${targetName} (${targetCode}).
${openingNote}

Rules:
- Stay in character as a curious, playful robot tutor only (no elves/orcs/forests).
- Keep replies short: 1–3 sentences.
- Reassure them: any level is fine; they should feel safe and unjudged while learning ${targetName}.
${explainRule}
${practiceRule}
- Ask one easy follow-up question.
- No markdown, no bullet lists.`;
}

async function tutorSystemPrompt(tutor, session, user) {
  const name = displayTutorName(tutor);
  const title = String(session?.title || '');
  if (/onboarding demo/i.test(title)) {
    return demoOnboardingSystemPrompt(tutor, session);
  }
  if (/onboarding preview/i.test(title)) {
    return previewOnboardingSystemPrompt(tutor, session);
  }
  if (title.startsWith('Role Play:')) {
    const customId = parseCustomScenarioId(title);
    if (customId && user?.id) {
      const custom = await fetchCustomById(user.id, customId);
      if (custom?.promptPayload) {
        return rolePlaySystemPrompt(title, {
          user,
          tutor,
          customPayload: custom.promptPayload,
        });
      }
    }
    return rolePlaySystemPrompt(title, { user, tutor });
  }
  if (title.startsWith('Lesson:') || title.startsWith('Practice:')) {
    const isPractice = title.startsWith('Practice:');
    const topic =
      title.replace(/^(Lesson|Practice):\s*/i, '').trim() || 'everyday English';
    return `You are ${name} in the Lingola app.
${characterBlurb(tutor)}
${characterLockRule(tutor)}
${flavorRule(tutor)}
${inCharacterReactionRule(tutor)}
${naturalEnglishRule('A2')}
${lessonTimingRule()}
${learnerAddressingRule(user || {})}
${goalContext(user || {})}
${learnerPersonalizationContext(user || {})}
${topicTeachingHints(topic)}
${lessonPedagogyRules()}
${explanationLanguageRule(user, session)}
Lesson topic: "${topic}".
${isPractice ? 'This is extra practice on the same topic — more repetition, simpler prompts.' : 'Teach phrase patterns in batches, then practice in conversation.'}
Rules:
- EVERY reply must sound like this character — not a generic human tutor.
- Stay in this character only. Keep your tone and voice consistent — never switch persona mid-lesson.
- Stay on this topic.
- Keep replies short: 1–3 sentences.
- For each idea, show 2–3 natural variants, then ask the learner to try one.
- Gently correct toward natural spoken English. Give specific praise.
- Ask one short follow-up that advances the topic (do not repeat the same question).
- If the learner is silent or shy, give a short in-character nudge (one sentence). Never a long pep talk.
- After several good exchanges, recap the real-life variants they can use.
- No markdown, no bullet lists.`;
  }
  return `You are ${name} in the Lingola language-learning app.
${characterBlurb(tutor)}
${characterLockRule(tutor)}
${flavorRule(tutor)}
${inCharacterReactionRule(tutor)}
${naturalEnglishRule('A1')}
${learnerAddressingRule(user || {})}
${goalContext(user || {})}
${learnerPersonalizationContext(user || {})}
${explanationLanguageRule(user, session)}
Rules:
- EVERY reply must sound like this character — voice, word choice, attitude. Not a generic human tutor.
- Stay in character as ${name} only. Never switch persona mid-chat.
- Speak simple clear natural English (A1–B1 unless the learner writes more advanced English).
- Keep replies short: 1–3 sentences.
- Prefer everyday variants over one school-book phrase.
- Gently correct mistakes by modeling a better natural phrase.
- Ask one short follow-up question to keep practice going.
- If the learner is silent or shy, give a short nudge (one sentence). Never a long pep talk.
- No markdown, no bullet lists.`;
}

async function callOpenAi({ system, history, userMessage, maxTokens = 220 }) {
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
      max_tokens: maxTokens,
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

  const user = await findUserById(userId);

  const userMsg = await insertMessage({
    sessionId,
    role: 'user',
    content: text,
  });
  await streak.recordActivity(userId, 'chat');

  const { messages: history } = await listMessages(sessionId, userId);
  const prior = history
    .filter((m) => m.id !== userMsg.id && m.role !== 'system')
    .slice(-16);

  const title = String(session?.title || '');
  const richSession =
    title.startsWith('Role Play:') ||
    title.startsWith('Lesson:') ||
    title.startsWith('Practice:');

  let replyText;
  try {
    replyText = await callOpenAi({
      system: await tutorSystemPrompt(tutor, session, user),
      history: prior,
      userMessage: text,
      maxTokens: richSession ? 320 : 220,
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

function mapPreviewSession(session) {
  return {
    id: session.id,
    tutorId: session.tutor.id,
    title: session.title,
    kind: session.kind,
    createdAt: session.createdAt,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}

function mapPreviewMessage(message) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

async function openPreviewSession({
  tutorId,
  tutorSlug,
  title,
  openingMessage,
  kind = 'chat',
  nativeLanguageCode,
  targetLanguageCode,
  explanationLanguage,
}) {
  prunePreviewSessions();
  const tutor = await resolveTutor({ tutorId, tutorSlug });
  const id = uuid();
  const sessionTitle =
    (title && String(title).trim()) || tutor.nameKey || tutor.slug;
  const createdAt = new Date().toISOString();
  const session = {
    id,
    tutor,
    title: sessionTitle,
    kind: ['chat', 'lesson', 'practice'].includes(kind) ? kind : 'chat',
    nativeLanguageCode: normalizeLangCode(nativeLanguageCode, 'tr'),
    targetLanguageCode: normalizeLangCode(targetLanguageCode, 'en'),
    explanationLanguage:
      String(explanationLanguage || 'native').trim().toLowerCase() === 'english'
        ? 'english'
        : 'native',
    createdAt,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
    messages: [],
  };
  const opening = String(openingMessage || '').trim();
  if (opening) {
    session.messages.push({
      id: uuid(),
      sessionId: id,
      role: 'assistant',
      content: opening,
      createdAt,
    });
  }
  previewSessions.set(id, session);
  return {
    session: mapPreviewSession(session),
    tutor,
    created: true,
    messages: session.messages.map(mapPreviewMessage),
  };
}

function getPreviewSessionOrThrow(sessionId) {
  prunePreviewSessions();
  const session = previewSessions.get(sessionId);
  if (!session) {
    const err = new Error('Preview chat session not found or expired');
    err.status = 404;
    throw err;
  }
  session.expiresAt = Date.now() + PREVIEW_TTL_MS;
  return session;
}

async function sendPreviewMessage({ sessionId, content }) {
  const text = String(content || '').trim();
  if (!text) {
    const err = new Error('Message content is required');
    err.status = 400;
    throw err;
  }
  const session = getPreviewSessionOrThrow(sessionId);
  const userMessage = {
    id: uuid(),
    sessionId,
    role: 'user',
    content: text,
    createdAt: new Date().toISOString(),
  };
  session.messages.push(userMessage);

  const prior = session.messages
    .filter((m) => m.id !== userMessage.id && m.role !== 'system')
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content }));
  const replyText = await callOpenAi({
    system: await tutorSystemPrompt(
      session.tutor,
      {
        id: session.id,
        title: session.title,
        kind: session.kind,
      },
      null,
    ),
    history: prior,
    userMessage: text,
  });
  const assistantMessage = {
    id: uuid(),
    sessionId,
    role: 'assistant',
    content: replyText,
    createdAt: new Date().toISOString(),
  };
  session.messages.push(assistantMessage);

  return {
    session: mapPreviewSession(session),
    userMessage: mapPreviewMessage(userMessage),
    assistantMessage: mapPreviewMessage(assistantMessage),
  };
}

async function claimPreviewSession({ userId, previewSessionId }) {
  const preview = getPreviewSessionOrThrow(previewSessionId);
  const result = await getOrCreateSession(userId, {
    tutorId: preview.tutor.id,
    forceNew: true,
    title: preview.title,
    kind: preview.kind,
  });
  for (const message of preview.messages) {
    await insertMessage({
      sessionId: result.session.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
    });
  }
  previewSessions.delete(previewSessionId);
  return {
    session: result.session,
    tutor: result.tutor,
    transferredMessages: preview.messages.length,
  };
}

module.exports = {
  getOrCreateSession,
  listSessionsForUser,
  listMessages,
  sendMessage,
  deleteSession,
  openPreviewSession,
  sendPreviewMessage,
  claimPreviewSession,
  findTutorById,
  insertMessage,
};
