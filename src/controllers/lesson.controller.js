'use strict';

const lessons = require('../services/lesson.service');

async function getPath(req, res, next) {
  try {
    const path = await lessons.getPath(req.user);
    res.json({ ok: true, ...path });
  } catch (err) {
    next(err);
  }
}

async function start(req, res, next) {
  try {
    const payload = await lessons.startLesson(req.user, req.params.slug, {
      tutorId: req.body?.tutorId,
      tutorSlug: req.body?.tutorSlug,
      kind: req.body?.kind,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function saveProgress(req, res, next) {
  try {
    const lesson = await lessons.saveLessonProgress(req.user, req.params.slug, {
      tutorId: req.body?.tutorId,
      sessionId: req.body?.sessionId || req.body?.chatSessionId,
      transcript: req.body?.transcript,
      elapsedSeconds: req.body?.elapsedSeconds,
      addElapsedSeconds: req.body?.addElapsedSeconds,
    });
    res.json({ ok: true, lesson });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const notes = await lessons.completeLesson(req.user, req.params.slug, {
      tutorId: req.body?.tutorId,
      sessionId: req.body?.sessionId || req.body?.chatSessionId,
      transcript: req.body?.transcript,
      kind: req.body?.kind,
      elapsedSeconds: req.body?.elapsedSeconds,
      addElapsedSeconds: req.body?.addElapsedSeconds,
    });
    res.json({ ok: true, ...notes });
  } catch (err) {
    next(err);
  }
}

async function getNotes(req, res, next) {
  try {
    const notes = await lessons.getNotes(req.user, req.params.slug);
    res.json({ ok: true, ...notes });
  } catch (err) {
    next(err);
  }
}

async function deleteNotes(req, res, next) {
  try {
    await lessons.deleteNotes(req.user, req.params.slug);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPath,
  start,
  saveProgress,
  complete,
  getNotes,
  deleteNotes,
};
