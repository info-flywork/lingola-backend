'use strict';

const speakingQuiz = require('../services/speaking_quiz.service');

async function getSpeakingPrompts(req, res, next) {
  try {
    const count = Number(req.query.count || req.query.limit || 6);
    const prompts = speakingQuiz.listPrompts({ count });
    res.json({ ok: true, prompts });
  } catch (err) {
    next(err);
  }
}

async function evaluateSpeaking(req, res, next) {
  try {
    const promptId = req.body?.promptId;
    const transcript = req.body?.transcript;
    if (!promptId) {
      const err = new Error('promptId is required');
      err.status = 400;
      throw err;
    }
    const result = speakingQuiz.evaluatePrompt({ promptId, transcript });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSpeakingPrompts,
  evaluateSpeaking,
};
