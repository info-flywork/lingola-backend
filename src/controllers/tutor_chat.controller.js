'use strict';

const chat = require('../services/tutor_chat.service');

async function openSession(req, res, next) {
  try {
    const tutorId = req.body?.tutorId;
    const tutorSlug = req.body?.tutorSlug;
    if (!tutorId && !tutorSlug) {
      const err = new Error('tutorId or tutorSlug is required');
      err.status = 400;
      throw err;
    }
    const result = await chat.getOrCreateSession(req.user.id, {
      tutorId,
      tutorSlug,
    });
    res.json({
      ok: true,
      session: result.session,
      tutor: result.tutor,
      created: result.created,
    });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const sessions = await chat.listSessionsForUser(req.user.id, {
      limit: req.query.limit,
    });
    res.json({ ok: true, sessions });
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const payload = await chat.listMessages(req.params.sessionId, req.user.id);
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function postMessage(req, res, next) {
  try {
    const payload = await chat.sendMessage({
      userId: req.user.id,
      sessionId: req.params.sessionId,
      content: req.body?.content ?? req.body?.message,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  openSession,
  listSessions,
  getMessages,
  postMessage,
};
