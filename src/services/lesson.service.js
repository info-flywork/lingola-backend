'use strict';

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');
const { env } = require('../config/env');
const { loadLessonCatalog } = require('../data/lesson-catalog');
const chat = require('./tutor_chat.service');
const streak = require('./streak.service');
const {
  characterBlurb,
  characterLockRule,
  flavorRule,
  naturalEnglishRule,
  lessonTimingRule,
  inCharacterReactionRule,
} = require('./tutor-personality');
const {
  learnerFirstName,
  learnerAddressingRule,
  goalContext,
  topicTeachingHints,
  lessonPedagogyRules,
  explanationLanguageRule,
} = require('./prompt_helpers');

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Onboarding beginner/intermediate/advanced → açılacak en yüksek CEFR. */
function maxCefrForUser(user) {
  const level = String(user?.onboarding?.level || 'beginner').toLowerCase();
  if (level === 'intermediate') return 'B2';
  if (level === 'advanced') return 'C1';
  return 'A2';
}

function cefrIndex(cefr) {
  const i = CEFR_ORDER.indexOf(String(cefr || '').toUpperCase());
  return i < 0 ? 0 : i;
}

/**
 * UI status:
 * - completed: mavi + check
 * - available: girilmiş / devam — mavi
 * - unlocked: seviye bandında ama henüz girilmemiş — gri, kilit yok
 * - locked: seviyenin üstü / önceki tamamlanmamış — kilit
 */
function resolveDisplayStatus(row, orderedRows, maxCefr) {
  if (row.status === 'completed') {
    return { status: 'completed', lockReason: null };
  }

  const maxIdx = cefrIndex(maxCefr);
  const lessonIdx = cefrIndex(row.cefr_level);
  const orderIndex = orderedRows.findIndex((r) => r.id === row.id);
  const engaged =
    Boolean(row.started_at) || Number(row.elapsed_seconds || 0) > 0;

  if (lessonIdx <= maxIdx) {
    if (engaged || row.status === 'available') {
      // available in DB but never started → still unlocked (gri)
      if (!engaged) return { status: 'unlocked', lockReason: null };
      return { status: 'available', lockReason: null };
    }
    return { status: 'unlocked', lockReason: null };
  }

  const prevDone =
    orderIndex <= 0 ||
    orderedRows
      .slice(0, orderIndex)
      .every((r) => r.status === 'completed');

  if (prevDone) {
    if (engaged) return { status: 'available', lockReason: null };
    return { status: 'unlocked', lockReason: null };
  }

  return { status: 'locked', lockReason: 'level' };
}

function canAccessLesson(row, orderedRows, maxCefr) {
  const { status } = resolveDisplayStatus(row, orderedRows, maxCefr);
  return status === 'completed' || status === 'available' || status === 'unlocked';
}

let catalogReady = false;

async function ensureCatalog() {
  if (catalogReady) return;
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM lessons');
  if (Number(rows[0]?.n || 0) > 0) {
    catalogReady = true;
    return;
  }

  const catalog = loadLessonCatalog();
  if (!catalog.length) {
    const err = new Error('Lesson catalog is empty');
    err.status = 500;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const lesson of catalog) {
      await conn.query(
        `INSERT INTO lessons (id, slug, cefr_level, sort_order, title_en, title_tr)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title_en = VALUES(title_en),
           title_tr = VALUES(title_tr)`,
        [
          lesson.id,
          lesson.slug,
          lesson.cefrLevel,
          lesson.sortOrder,
          lesson.titleEn,
          lesson.titleTr,
        ],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  catalogReady = true;
}

async function listLessonsOrdered() {
  const [rows] = await pool.query(
    `SELECT * FROM lessons
     ORDER BY FIELD(cefr_level, 'A1','A2','B1','B2','C1','C2'), sort_order ASC`,
  );
  return rows;
}

async function ensureUserPath(userId, user) {
  await ensureCatalog();
  const lessons = await listLessonsOrdered();
  const [existing] = await pool.query(
    'SELECT lesson_id FROM user_lesson_progress WHERE user_id = ?',
    [userId],
  );
  if (existing.length >= lessons.length) return;

  const have = new Set(existing.map((r) => r.lesson_id));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const lesson of lessons) {
      if (have.has(lesson.id)) continue;
      await conn.query(
        `INSERT INTO user_lesson_progress (user_id, lesson_id, status, completed_at)
         VALUES (?, ?, 'locked', NULL)`,
        [userId, lesson.id],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Otomatik "completed" atanmış ama notu olmayan sahte tamamlamaları sıfırla. */
async function repairFakeCompletions(userId) {
  await pool.query(
    `UPDATE user_lesson_progress p
     LEFT JOIN user_lesson_notes n
       ON n.user_id = p.user_id AND n.lesson_id = p.lesson_id
     SET p.status = 'locked',
         p.completed_at = NULL,
         p.needs_practice = 0,
         p.started_at = NULL
     WHERE p.user_id = ?
       AND p.status = 'completed'
       AND n.id IS NULL`,
    [userId],
  );
}

/**
 * Continue kartı için bir odak dersi `available` tut.
 * Seviye bandındaki diğer dersleri toplu kilitleme — UI unlocked olarak gösterir.
 */
async function ensureAvailableLesson(userId, maxCefr = 'A2') {
  const [rows] = await pool.query(
    `SELECT p.lesson_id, p.status, p.started_at, p.elapsed_seconds, l.cefr_level
     FROM user_lesson_progress p
     INNER JOIN lessons l ON l.id = p.lesson_id
     WHERE p.user_id = ?
     ORDER BY FIELD(l.cefr_level, 'A1','A2','B1','B2','C1','C2'), l.sort_order ASC`,
    [userId],
  );
  if (!rows.length) return;

  const maxIdx = cefrIndex(maxCefr);
  let focus =
    rows
      .filter(
        (row) =>
          row.status !== 'completed' &&
          (row.started_at || Number(row.elapsed_seconds || 0) > 0),
      )
      .sort((a, b) => {
        const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
        const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return Number(b.elapsed_seconds || 0) - Number(a.elapsed_seconds || 0);
      })[0] ||
    rows.find(
      (row) =>
        row.status !== 'completed' && cefrIndex(row.cefr_level) <= maxIdx,
    );

  if (!focus) {
    focus = rows.find((row, index) => {
      if (row.status === 'completed') return false;
      return rows.slice(0, index).every((r) => r.status === 'completed');
    });
  }
  if (!focus) return;

  if (focus.status === 'locked') {
    await pool.query(
      `UPDATE user_lesson_progress
       SET status = 'available'
       WHERE user_id = ? AND lesson_id = ? AND status = 'locked'`,
      [userId, focus.lesson_id],
    );
  }
}

async function normalizeUserPath(userId, user) {
  await repairFakeCompletions(userId);
  await ensureAvailableLesson(userId, maxCefrForUser(user));
}

function mapLesson(row, progress) {
  const elapsedSeconds = Math.max(
    0,
    Number(progress?.elapsed_seconds ?? row.elapsed_seconds ?? 0) || 0,
  );
  const segmentSeconds = 15 * 60;
  return {
    id: row.id,
    slug: row.slug,
    cefrLevel: row.cefr_level,
    sortOrder: row.sort_order,
    titleEn: row.title_en,
    titleTr: row.title_tr,
    status: progress?.status || row.status || 'locked',
    needsPractice: Boolean(progress?.needs_practice ?? row.needs_practice),
    hasNotes: Boolean(progress?.has_notes ?? row.has_notes),
    tutorId: progress?.tutor_id || row.tutor_id || null,
    tutorSlug: progress?.tutor_slug || row.tutor_slug || null,
    tutorNameKey: progress?.tutor_name_key || row.tutor_name_key || null,
    chatSessionId: progress?.chat_session_id || row.chat_session_id || null,
    startedAt: progress?.started_at || row.started_at || null,
    completedAt: progress?.completed_at || row.completed_at || null,
    elapsedSeconds,
    remainingSeconds: Math.max(0, segmentSeconds - elapsedSeconds),
  };
}

async function getPath(user) {
  await ensureUserPath(user.id, user);
  await normalizeUserPath(user.id, user);
  const maxCefr = maxCefrForUser(user);
  const [rows] = await pool.query(
    `SELECT
       l.*,
       p.status,
       p.needs_practice,
       p.tutor_id,
       p.chat_session_id,
       p.completed_at,
       p.started_at,
       p.elapsed_seconds,
       p.updated_at,
       t.slug AS tutor_slug,
       t.name_key AS tutor_name_key,
       (n.id IS NOT NULL) AS has_notes
     FROM lessons l
     LEFT JOIN user_lesson_progress p
       ON p.lesson_id = l.id AND p.user_id = ?
     LEFT JOIN tutors t ON t.id = p.tutor_id
     LEFT JOIN user_lesson_notes n
       ON n.lesson_id = l.id AND n.user_id = ?
     ORDER BY FIELD(l.cefr_level, 'A1','A2','B1','B2','C1','C2'), l.sort_order ASC`,
    [user.id, user.id],
  );

  const byLevel = {};
  for (const cefr of CEFR_ORDER) {
    byLevel[cefr.toLowerCase()] = [];
  }

  const mappedRows = [];
  for (const row of rows) {
    const key = String(row.cefr_level).toLowerCase();
    const display = resolveDisplayStatus(row, rows, maxCefr);
    const mapped = mapLesson(row, {
      ...row,
      status: display.status,
    });
    mapped.lockReason = display.lockReason;
    byLevel[key].push(mapped);
    mappedRows.push({ row, mapped, display });
  }

  // Continue = en son girilen / ilerlemesi olan ders (ilk unlocked değil).
  const engaged = mappedRows
    .filter(
      ({ row, display }) =>
        display.status !== 'completed' &&
        (row.started_at || Number(row.elapsed_seconds || 0) > 0),
    )
    .sort((a, b) => {
      const ua = a.row.updated_at ? new Date(a.row.updated_at).getTime() : 0;
      const ub = b.row.updated_at ? new Date(b.row.updated_at).getTime() : 0;
      if (ub !== ua) return ub - ua;
      const ta = a.row.started_at ? new Date(a.row.started_at).getTime() : 0;
      const tb = b.row.started_at ? new Date(b.row.started_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (
        Number(b.row.elapsed_seconds || 0) - Number(a.row.elapsed_seconds || 0)
      );
    });

  let currentSlug = engaged[0]?.mapped.slug || null;
  if (!currentSlug) {
    const available = mappedRows.find(
      ({ display }) => display.status === 'available',
    );
    currentSlug = available?.mapped.slug || null;
  }
  if (!currentSlug) {
    const unlocked = mappedRows.find(
      ({ display }) => display.status === 'unlocked',
    );
    currentSlug = unlocked?.mapped.slug || null;
  }

  const needsPractice = rows.find(
    (r) => r.status === 'completed' && r.needs_practice,
  );

  return {
    currentLessonSlug: currentSlug || needsPractice?.slug || null,
    userCefrMax: maxCefr,
    userAppLevel: String(user?.onboarding?.level || 'beginner').toLowerCase(),
    levels: CEFR_ORDER.map((cefr) => ({
      id: cefr.toLowerCase(),
      cefrLevel: cefr,
      lessons: byLevel[cefr.toLowerCase()] || [],
    })),
  };
}

async function findLessonBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM lessons WHERE slug = ? LIMIT 1', [
    slug,
  ]);
  return rows[0] || null;
}

async function getProgress(userId, lessonId) {
  const [rows] = await pool.query(
    `SELECT * FROM user_lesson_progress
     WHERE user_id = ? AND lesson_id = ? LIMIT 1`,
    [userId, lessonId],
  );
  return rows[0] || null;
}

async function assertLessonAccess(user, slug, { allowCompleted = true } = {}) {
  await ensureUserPath(user.id, user);
  await normalizeUserPath(user.id, user);
  const lesson = await findLessonBySlug(slug);
  if (!lesson) {
    const err = new Error('Lesson not found');
    err.status = 404;
    throw err;
  }

  // Free: müfredatta yalnızca ilk 2 ders. Trial/premium → hepsi.
  const isPremium = String(user.subscriptionStatus || '').toLowerCase() === 'premium';
  if (!isPremium) {
    const ordered = await listLessonsOrdered();
    const index = ordered.findIndex((row) => row.id === lesson.id);
    if (index >= 2) {
      const err = new Error(
        'Premium required — free plan includes the first 2 lessons only',
      );
      err.status = 402;
      err.code = 'PREMIUM_REQUIRED';
      throw err;
    }
  }

  const progress = await getProgress(user.id, lesson.id);
  const status = progress?.status || 'locked';
  const maxCefr = maxCefrForUser(user);
  const ordered = await listLessonsOrdered();
  const [progressRows] = await pool.query(
    `SELECT p.lesson_id AS id, p.status, p.started_at, p.elapsed_seconds, l.cefr_level
     FROM user_lesson_progress p
     INNER JOIN lessons l ON l.id = p.lesson_id
     WHERE p.user_id = ?
     ORDER BY FIELD(l.cefr_level, 'A1','A2','B1','B2','C1','C2'), l.sort_order ASC`,
    [user.id],
  );
  const orderedWithProgress = ordered.map((l) => {
    const p = progressRows.find((r) => r.id === l.id) || {};
    return {
      id: l.id,
      status: p.status || 'locked',
      started_at: p.started_at || null,
      elapsed_seconds: p.elapsed_seconds || 0,
      cefr_level: l.cefr_level,
    };
  });
  const rowForAccess = {
    id: lesson.id,
    status,
    started_at: progress?.started_at || null,
    elapsed_seconds: progress?.elapsed_seconds || 0,
    cefr_level: lesson.cefr_level,
  };

  if (!canAccessLesson(rowForAccess, orderedWithProgress, maxCefr)) {
    const err = new Error(
      `Your English level is ${maxCefr}, so you can't open ${lesson.cefr_level} lessons without completing the earlier path.`,
    );
    err.status = 403;
    err.code = 'LEVEL_REQUIRED';
    err.userCefrMax = maxCefr;
    err.lessonCefr = lesson.cefr_level;
    throw err;
  }

  if (!allowCompleted && status !== 'available' && status !== 'completed') {
    if (
      status === 'locked' &&
      canAccessLesson(rowForAccess, orderedWithProgress, maxCefr)
    ) {
      return { lesson, progress };
    }
    const err = new Error('Lesson is not available');
    err.status = 403;
    throw err;
  }
  return { lesson, progress };
}

function openingFor(lesson, tutor, kind) {
  return require('./tutor-personality').openingFor(lesson, tutor, kind);
}

function handoffOpening(lesson, tutor, opts) {
  return require('./tutor-personality').handoffOpening(lesson, tutor, opts);
}

function displayTutorLabel(tutor) {
  const raw = String(tutor?.nameKey || tutor?.slug || 'Tutor');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

async function loadHandoffSummary(userId, lessonId, previousTutorId) {
  const [noteRows] = await pool.query(
    `SELECT spoken_summary
     FROM user_lesson_notes
     WHERE user_id = ? AND lesson_id = ?
     LIMIT 1`,
    [userId, lessonId],
  );
  const fromNotes = String(noteRows[0]?.spoken_summary || '').trim();
  if (fromNotes) return fromNotes;

  const [msgRows] = await pool.query(
    `SELECT m.content
     FROM tutor_chat_messages m
     INNER JOIN tutor_chat_sessions s ON s.id = m.session_id
     INNER JOIN user_lesson_progress p
       ON p.chat_session_id = s.id AND p.user_id = s.user_id
     WHERE s.user_id = ? AND p.lesson_id = ? AND m.role = 'assistant'
     ORDER BY m.created_at DESC
     LIMIT 3`,
    [userId, lessonId],
  );
  if (msgRows.length) {
    return msgRows
      .map((r) => String(r.content || '').trim())
      .filter(Boolean)
      .reverse()
      .join(' ');
  }

  if (previousTutorId) {
    return `some phrases from this lesson`;
  }
  return '';
}

async function startLesson(user, slug, { tutorId, tutorSlug, kind = 'lesson' } = {}) {
  const sessionKind = kind === 'practice' ? 'practice' : 'lesson';
  // assertLessonAccess: seviye bandı / sıra kontrolü (DB locked olsa bile açılabilir).
  const { lesson, progress } = await assertLessonAccess(user, slug);

  const previousTutorId = progress?.tutor_id || null;
  let previousTutor = null;
  if (previousTutorId) {
    previousTutor = await chat.findTutorById(previousTutorId);
  }

  const result = await chat.getOrCreateSession(user.id, {
    tutorId,
    tutorSlug,
    forceNew: true,
    title:
      sessionKind === 'practice'
        ? `Practice: ${lesson.title_en}`
        : `Lesson: ${lesson.title_en}`,
    lessonSlug: lesson.slug,
    kind: sessionKind,
  });

  const switchingTutor =
    Boolean(previousTutorId) &&
    previousTutorId !== result.tutor.id &&
    Number(progress?.elapsed_seconds || 0) > 0;

  let opening;
  if (switchingTutor) {
    const summary = await loadHandoffSummary(
      user.id,
      lesson.id,
      previousTutorId,
    );
    opening = handoffOpening(lesson, result.tutor, {
      previousTutorName: displayTutorLabel(previousTutor || { nameKey: 'your previous tutor' }),
      summary,
      kind: sessionKind,
      learnerName: learnerFirstName(user),
    });
  } else if (Number(progress?.elapsed_seconds || 0) > 0) {
    const display = displayTutorLabel(result.tutor);
    const learner = learnerFirstName(user);
    const hi = learner ? `Welcome back, ${learner}!` : 'Welcome back!';
    opening = `${hi} I'm ${display}. Let's continue "${lesson.title_en}" (${lesson.cefr_level}) from where we left off. Ready?`;
  } else {
    const learner = learnerFirstName(user);
    opening = openingFor(lesson, result.tutor, sessionKind, { learnerName: learner });
  }

  await chat.insertMessage({
    sessionId: result.session.id,
    role: 'assistant',
    content: opening,
  });

  await pool.query(
    `UPDATE user_lesson_progress
     SET tutor_id = ?,
         chat_session_id = ?,
         started_at = UTC_TIMESTAMP(3),
         status = CASE WHEN status = 'locked' THEN 'available' ELSE status END
     WHERE user_id = ? AND lesson_id = ?`,
    [result.tutor.id, result.session.id, user.id, lesson.id],
  );

  const elapsedSeconds = Math.max(0, Number(progress?.elapsed_seconds || 0) || 0);

  return {
    lesson: mapLesson(lesson, {
      ...progress,
      tutor_id: result.tutor.id,
      chat_session_id: result.session.id,
      elapsed_seconds: elapsedSeconds,
    }),
    session: result.session,
    tutor: result.tutor,
    openingMessage: opening,
    kind: sessionKind,
    systemPrompt: lessonSystemPrompt(result.tutor, lesson, sessionKind, {
      handoff: switchingTutor,
      previousTutorName: previousTutor
        ? displayTutorLabel(previousTutor)
        : null,
      elapsedSeconds,
      user,
    }),
    elapsedSeconds,
    remainingSeconds: Math.max(0, 15 * 60 - elapsedSeconds),
    resumed: elapsedSeconds > 0,
    handoff: switchingTutor,
  };
}

async function saveLessonProgress(
  user,
  slug,
  { tutorId, sessionId, transcript = [], elapsedSeconds, addElapsedSeconds } = {},
) {
  const { lesson, progress } = await assertLessonAccess(user, slug);
  const chatSessionId = sessionId || progress?.chat_session_id || null;

  if (chatSessionId && Array.isArray(transcript) && transcript.length) {
    await persistTranscript(chatSessionId, user.id, transcript);
  }

  let nextElapsed = Math.max(0, Number(progress?.elapsed_seconds || 0) || 0);
  if (addElapsedSeconds != null && Number.isFinite(Number(addElapsedSeconds))) {
    nextElapsed += Math.max(0, Math.floor(Number(addElapsedSeconds)));
  } else if (elapsedSeconds != null && Number.isFinite(Number(elapsedSeconds))) {
    nextElapsed = Math.max(nextElapsed, Math.floor(Number(elapsedSeconds)));
  }
  nextElapsed = Math.min(nextElapsed, 15 * 60);

  const tutor =
    (tutorId && (await chat.findTutorById(tutorId))) ||
    (progress?.tutor_id && (await chat.findTutorById(progress.tutor_id))) ||
    null;

  await pool.query(
    `UPDATE user_lesson_progress
     SET elapsed_seconds = ?,
         started_at = COALESCE(started_at, UTC_TIMESTAMP(3)),
         tutor_id = COALESCE(?, tutor_id),
         chat_session_id = COALESCE(?, chat_session_id),
         status = CASE WHEN status = 'completed' THEN status ELSE 'available' END
     WHERE user_id = ? AND lesson_id = ?`,
    [
      nextElapsed,
      tutor?.id || null,
      chatSessionId || null,
      user.id,
      lesson.id,
    ],
  );

  const updated = await getProgress(user.id, lesson.id);
  return mapLesson(lesson, {
    ...updated,
    tutor_slug: tutor?.slug || null,
    tutor_name_key: tutor?.nameKey || tutor?.name_key || null,
  });
}

function displayName(tutor) {
  const raw = String(tutor?.nameKey || tutor?.slug || 'Tutor');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function lessonSystemPrompt(tutor, lesson, kind, opts = {}) {
  const name = displayName(tutor);
  const topic = lesson.title_en;
  const level = lesson.cefr_level;
  const user = opts.user || null;
  const mode =
    kind === 'practice'
      ? 'This is extra practice on the same topic because the learner needs more repetition.'
      : 'This is a structured lesson. Teach phrase patterns in batches, then practice them in conversation.';
  const handoffBit = opts.handoff
    ? `The learner switched from ${opts.previousTutorName || 'another tutor'}. Acknowledge briefly what they already practiced, then continue the lesson — do not restart from zero.`
    : opts.elapsedSeconds > 0
      ? `The learner is resuming this lesson (about ${Math.floor(opts.elapsedSeconds / 60)} minutes already done of 15). Continue from where they left off.`
      : '';
  return `You are ${name} in the Lingola app.
${characterBlurb(tutor)}
${characterLockRule(tutor)}
${flavorRule(tutor)}
${inCharacterReactionRule(tutor)}
${naturalEnglishRule(level)}
${lessonTimingRule()}
${learnerAddressingRule(user || {})}
${goalContext(user || {})}
${topicTeachingHints(topic)}
${lessonPedagogyRules()}
${explanationLanguageRule(user, null)}
Lesson topic: "${topic}". CEFR level: ${level}.
${mode}
${handoffBit}
Rules:
- EVERY reply must sound like this character — voice, word choice, attitude. Not a generic human tutor.
- Stay in this character only. Keep your tone and voice consistent — never switch persona mid-lesson.
- Stay on this topic. Do not switch to unrelated subjects.
- Speak English at ${level} difficulty. Keep replies short: 1–3 sentences.
- Teach useful everyday phrases: show 2–3 natural variants for the same idea, then ask the learner to try one.
- Gently correct toward natural spoken English (not stiff school English). Praise specific good phrases.
- Ask one short follow-up question that advances the topic (do not repeat the same question).
- If the learner is silent or shy, give a short in-character nudge (one sentence). Never a long pep talk.
- After several good exchanges, recap the variants they can use in real life.
- No markdown, no bullet lists in spoken replies.`;
}

async function persistTranscript(sessionId, userId, transcript = []) {
  if (!Array.isArray(transcript) || !transcript.length) return;
  const { messages } = await chat.listMessages(sessionId, userId);
  const existing = new Set(messages.map((m) => `${m.role}:${m.content}`));
  for (const turn of transcript) {
    const role = turn.role === 'user' ? 'user' : 'assistant';
    const content = String(turn.content || turn.text || '').trim();
    if (!content) continue;
    const key = `${role}:${content}`;
    if (existing.has(key)) continue;
    existing.add(key);
    await chat.insertMessage({ sessionId, role, content });
  }
}

function userTurnsFromTranscript(transcript = []) {
  return (transcript || [])
    .filter((t) => t.role === 'user')
    .map((t) => String(t.content || t.text || '').trim())
    .filter((t) => t.length >= 2);
}

function evaluateLearner(transcript = [], tutor, previousScore) {
  const turns = userTurnsFromTranscript(transcript);
  const n = turns.length;
  const chars = turns.reduce((sum, t) => sum + t.length, 0);
  let score;
  let participation;

  if (n === 0) {
    score = 12;
    participation = 'silent';
  } else if (n === 1 || (n === 2 && chars < 28)) {
    score = 28;
    participation = 'passive';
  } else if (n < 4) {
    score = Math.min(62, 42 + n * 6);
    participation = 'active';
  } else if (n < 7) {
    score = Math.min(82, 58 + n * 3 + Math.min(8, Math.floor(chars / 50)));
    participation = 'active';
  } else {
    score = Math.min(96, 74 + Math.min(14, n) + Math.min(8, Math.floor(chars / 80)));
    participation = 'strong';
  }

  const slug = String(tutor?.slug || tutor?.nameKey || '').toLowerCase();
  const evaluation = evaluationFor(participation, slug, {
    score,
    previousScore,
  });

  return {
    score,
    previousScore: previousScore == null ? null : Number(previousScore),
    participation,
    evaluation,
    userTurns: n,
    needsPractice: participation === 'silent' || participation === 'passive',
  };
}

function evaluationFor(participation, slug, { score, previousScore }) {
  const improved =
    previousScore != null && Number.isFinite(Number(previousScore)) && score > Number(previousScore);
  const delta = improved ? ` Last time ${previousScore}/100, now ${score}/100.` : '';

  const silent = {
    ukrath:
      'You said nothing, human. Sitting still is not a lesson. I think you should retake this.',
    zephyrion:
      'Zero human words detected. Silent on purpose? Retake — I will not abduct you for speaking.',
    elrion:
      'The forest heard only quiet. A first word is a first step. Retake this lesson.',
    vaelen:
      'Your voice did not enter the circle. One word is enough magic. Retake this lesson.',
    santa:
      'Ho ho — not a peep! The list likes talkers. Please retake this lesson.',
    default:
      'Passive participant — you stayed quiet. I think you should retake this lesson.',
  };
  const passive = {
    ukrath:
      'Almost silent. Brave to show up — now speak. Retake and try a full sentence.',
    zephyrion:
      'Very few human sounds. Say more next time. Retake this lesson.',
    default:
      'You barely spoke. Try the lesson again and join the conversation.',
  };
  const active =
    'Good participation. You joined the talk — keep going.';
  const strong =
    'Strong participation. You spoke a lot. Great work.';

  if (participation === 'silent') {
    return (silent[slug] || silent.default) + delta;
  }
  if (participation === 'passive') {
    return (passive[slug] || passive.default) + delta;
  }
  if (participation === 'strong') return strong + delta;
  return active + delta;
}

async function generateNotes({ lesson, tutor, transcript, kind, user }) {
  const name = displayName(tutor);
  const learner = learnerFirstName(user) || 'Learner';
  const lines = (transcript || [])
    .map((t) => {
      const role = t.role === 'user' ? learner : name;
      const text = String(t.content || t.text || '').trim();
      return text ? `${role}: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const fallback = {
    spokenSummary: `Today we practiced "${lesson.title_en}". Review the phrases below and try them again soon.`,
    notes:
      `# ${lesson.title_en} (${lesson.cefr_level})\n\n` +
      `## What we practiced\nThis lesson focused on **${lesson.title_en}**.\n\n` +
      `## Key phrases\n- Keep it simple and try one new sentence each day.\n\n` +
      `## Example sentences\n- "Let's talk about ${lesson.title_en.toLowerCase()}."\n- "Can you say that again, please?"\n\n` +
      `## Next step\nPractice the same topic once more if it still feels hard.`,
    needsPractice: userTurnsFromTranscript(transcript).length < 2,
  };

  if (!env.openai.apiKey || !lines) return fallback;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.openai.model || 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1100,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You write lesson notes for Lingola, an English-learning app.
Reply with JSON only. Be specific — quote phrases from the transcript when possible.
Feedback should feel personal and encouraging. Use the learner's name in spokenSummary when provided.`,
          },
          {
            role: 'user',
            content: `Tutor name: ${name}
Learner name: ${learner}
Topic: ${lesson.title_en}
CEFR: ${lesson.cefr_level}
Mode: ${kind}
${goalContext(user || {})}
${topicTeachingHints(lesson.title_en)}
Transcript:
${lines}

Return JSON:
{
  "spokenSummary": "2-4 spoken sentences addressed to ${learner}: what we learned, specific praise, warm close",
  "notes": "Markdown lesson notes in English. Sections: What we learned, Natural phrases (for each idea: 2-3 everyday variants + short example + Turkish), Corrections from the chat (quote learner mistakes + better phrase), Real-life practice tip",
  "needsPractice": true or false
}
needsPractice=true if the learner spoke very little, repeated the same short answers, or missed key topic phrases.
Prefer natural spoken English variants over single textbook phrases.`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw);
    return {
      spokenSummary: String(parsed.spokenSummary || fallback.spokenSummary).trim(),
      notes: String(parsed.notes || fallback.notes).trim(),
      needsPractice: Boolean(parsed.needsPractice),
    };
  } catch (_) {
    return fallback;
  }
}

async function unlockNext(userId) {
  const [nextRows] = await pool.query(
    `SELECT l.id FROM lessons l
     INNER JOIN user_lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
     WHERE p.status = 'locked'
     ORDER BY FIELD(l.cefr_level, 'A1','A2','B1','B2','C1','C2'), l.sort_order ASC
     LIMIT 1`,
    [userId],
  );
  if (!nextRows.length) return null;
  await pool.query(
    `UPDATE user_lesson_progress
     SET status = 'available'
     WHERE user_id = ? AND lesson_id = ? AND status = 'locked'`,
    [userId, nextRows[0].id],
  );
  return nextRows[0].id;
}

async function completeLesson(
  user,
  slug,
  {
    tutorId,
    sessionId,
    transcript = [],
    kind = 'lesson',
    elapsedSeconds,
    addElapsedSeconds,
  } = {},
) {
  const { lesson, progress } = await assertLessonAccess(user, slug);
  let tutor = null;
  if (tutorId) tutor = await chat.findTutorById(tutorId);
  if (!tutor && progress?.tutor_id) tutor = await chat.findTutorById(progress.tutor_id);
  if (!tutor) {
    const err = new Error('Tutor is required to complete a lesson');
    err.status = 400;
    throw err;
  }

  const chatSessionId = sessionId || progress?.chat_session_id || null;
  if (chatSessionId && transcript.length) {
    await persistTranscript(chatSessionId, user.id, transcript);
  }

  let nextElapsed = Math.max(0, Number(progress?.elapsed_seconds || 0) || 0);
  if (addElapsedSeconds != null && Number.isFinite(Number(addElapsedSeconds))) {
    nextElapsed += Math.max(0, Math.floor(Number(addElapsedSeconds)));
  } else if (elapsedSeconds != null && Number.isFinite(Number(elapsedSeconds))) {
    nextElapsed = Math.max(nextElapsed, Math.floor(Number(elapsedSeconds)));
  }
  nextElapsed = Math.min(nextElapsed, 15 * 60);

  const [prevRows] = await pool.query(
    `SELECT n.score, n.attempt_count, p.best_score
     FROM user_lesson_progress p
     LEFT JOIN user_lesson_notes n
       ON n.user_id = p.user_id AND n.lesson_id = p.lesson_id
     WHERE p.user_id = ? AND p.lesson_id = ?
     LIMIT 1`,
    [user.id, lesson.id],
  );
  const previousScore = prevRows[0]?.score == null ? null : Number(prevRows[0].score);
  const prevAttempts = Number(prevRows[0]?.attempt_count || 0);
  const prevBest = prevRows[0]?.best_score == null ? null : Number(prevRows[0].best_score);

  const generated = await generateNotes({
    lesson,
    tutor,
    transcript,
    kind,
    user,
  });
  const review = evaluateLearner(transcript, tutor, previousScore);
  const needsPractice = review.needsPractice || generated.needsPractice ? 1 : 0;
  const attemptCount = prevAttempts + 1;
  const bestScore = prevBest == null ? review.score : Math.max(prevBest, review.score);

  const noteId = uuid();
  await pool.query(
    `INSERT INTO user_lesson_notes
       (id, user_id, lesson_id, tutor_id, chat_session_id, spoken_summary, notes_md,
        score, previous_score, participation, evaluation, user_turns, attempt_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       tutor_id = VALUES(tutor_id),
       chat_session_id = VALUES(chat_session_id),
       spoken_summary = VALUES(spoken_summary),
       notes_md = VALUES(notes_md),
       score = VALUES(score),
       previous_score = VALUES(previous_score),
       participation = VALUES(participation),
       evaluation = VALUES(evaluation),
       user_turns = VALUES(user_turns),
       attempt_count = VALUES(attempt_count)`,
    [
      noteId,
      user.id,
      lesson.id,
      tutor.id,
      chatSessionId,
      generated.spokenSummary,
      generated.notes,
      review.score,
      previousScore,
      review.participation,
      review.evaluation,
      review.userTurns,
      attemptCount,
    ],
  );

  await pool.query(
    `UPDATE user_lesson_progress
     SET status = 'completed',
         needs_practice = ?,
         last_score = ?,
         best_score = ?,
         tutor_id = ?,
         chat_session_id = COALESCE(?, chat_session_id),
         elapsed_seconds = ?,
         completed_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND lesson_id = ?`,
    [
      needsPractice,
      review.score,
      bestScore,
      tutor.id,
      chatSessionId,
      nextElapsed,
      user.id,
      lesson.id,
    ],
  );

  if (progress.status !== 'completed') {
    await unlockNext(user.id);
  }

  const certificateService = require('./certificate.service');
  await certificateService.syncCertificatesForUser(user.id);

  await streak.recordActivity(user.id, 'lesson');

  const notes = await getNotes(user, slug);
  return notes;
}

async function getNotes(user, slug) {
  const lesson = await findLessonBySlug(slug);
  if (!lesson) {
    const err = new Error('Lesson not found');
    err.status = 404;
    throw err;
  }
  const [rows] = await pool.query(
    `SELECT n.*, p.needs_practice, p.status, p.chat_session_id, p.best_score,
            t.slug AS tutor_slug, t.name_key AS tutor_name_key,
            t.image_cdn_url, t.local_image_path
     FROM user_lesson_notes n
     INNER JOIN user_lesson_progress p
       ON p.user_id = n.user_id AND p.lesson_id = n.lesson_id
     LEFT JOIN tutors t ON t.id = n.tutor_id
     WHERE n.user_id = ? AND n.lesson_id = ?
     LIMIT 1`,
    [user.id, lesson.id],
  );
  if (!rows.length) {
    const err = new Error('No lesson notes yet');
    err.status = 404;
    throw err;
  }
  const row = rows[0];
  return {
    lesson: {
      slug: lesson.slug,
      cefrLevel: lesson.cefr_level,
      titleEn: lesson.title_en,
      titleTr: lesson.title_tr,
    },
    spokenSummary: row.spoken_summary,
    notes: row.notes_md,
    needsPractice: Boolean(row.needs_practice),
    score: Number(row.score || 0),
    previousScore: row.previous_score == null ? null : Number(row.previous_score),
    bestScore: row.best_score == null ? null : Number(row.best_score),
    participation: row.participation || 'silent',
    evaluation: row.evaluation || null,
    userTurns: Number(row.user_turns || 0),
    attemptCount: Number(row.attempt_count || 1),
    status: row.status,
    chatSessionId: row.chat_session_id,
    tutor: row.tutor_id
      ? {
          id: row.tutor_id,
          slug: row.tutor_slug,
          nameKey: row.tutor_name_key,
          imageCdnUrl: row.image_cdn_url,
          localImagePath: row.local_image_path,
        }
      : null,
    updatedAt: row.updated_at,
  };
}

async function deleteNotes(user, slug) {
  const lesson = await findLessonBySlug(slug);
  if (!lesson) {
    const err = new Error('Lesson not found');
    err.status = 404;
    throw err;
  }
  await pool.query(
    'DELETE FROM user_lesson_notes WHERE user_id = ? AND lesson_id = ?',
    [user.id, lesson.id],
  );
  return { ok: true };
}

module.exports = {
  getPath,
  startLesson,
  saveLessonProgress,
  completeLesson,
  getNotes,
  deleteNotes,
  lessonSystemPrompt,
  ensureCatalog,
};
