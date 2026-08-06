'use strict';

const {
  getReadingWordsForUser,
  getWritingPromptsForUser,
} = require('../services/word_bank.service');
const {
  evaluateWritingText,
  evaluateWritingAudio,
} = require('../services/writing_eval.service');

async function getReadingWords(req, res, next) {
  try {
    const count = Number(req.query.count || req.query.limit || 10);
    const excludeRaw = req.query.exclude || '';
    const excludeIds = String(excludeRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    const payload = await getReadingWordsForUser(req.user, {
      count,
      excludeIds,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function getWritingWords(req, res, next) {
  try {
    const count = Number(req.query.count || req.query.limit || 1);
    const excludeRaw = req.query.exclude || '';
    const excludeIds = String(excludeRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    const payload = await getWritingPromptsForUser(req.user, {
      count,
      excludeIds,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function evaluateWritingAnswer(req, res, next) {
  try {
    const wordId = req.body?.wordId;
    const answer = req.body?.answer;
    if (!wordId) {
      const err = new Error('wordId is required');
      err.status = 400;
      throw err;
    }
    const result = await evaluateWritingText({
      user: req.user,
      wordId,
      answer,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function evaluateWritingRecording(req, res, next) {
  try {
    const wordId = req.body?.wordId;
    const audioBase64 = req.body?.audioBase64;
    const contentType = req.body?.contentType || 'audio/m4a';
    if (!wordId || !audioBase64) {
      const err = new Error('wordId and audioBase64 are required');
      err.status = 400;
      throw err;
    }
    const result = await evaluateWritingAudio({
      user: req.user,
      wordId,
      audioBase64,
      contentType,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getReadingWords,
  getWritingWords,
  evaluateWritingAnswer,
  evaluateWritingRecording,
};
