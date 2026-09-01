'use strict';

const roleplay = require('../services/roleplay.service');
const roleplayGenerate = require('../services/roleplay_generate.service');

async function listScenarios(req, res, next) {
  try {
    const scenarios = await roleplay.listScenariosForUser(req.user.id);
    res.json({ ok: true, scenarios });
  } catch (err) {
    next(err);
  }
}

async function saveProgress(req, res, next) {
  try {
    const scenarioId = String(req.params.scenarioId || '').trim();
    if (!scenarioId) {
      return res.status(400).json({ ok: false, message: 'scenarioId is required' });
    }

    const additionalSeconds = Number(req.body?.additionalSeconds);
    if (!Number.isFinite(additionalSeconds) || additionalSeconds < 0) {
      return res
        .status(400)
        .json({ ok: false, message: 'additionalSeconds must be a non-negative number' });
    }

    const sessionId = req.body?.sessionId
      ? String(req.body.sessionId).trim()
      : null;

    const progress = await roleplay.recordProgress(req.user.id, scenarioId, {
      sessionId,
      additionalSeconds,
    });

    res.json({ ok: true, progress });
  } catch (err) {
    next(err);
  }
}

async function generateCustomScenario(req, res, next) {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const nativeLanguageCode =
      req.body?.nativeLanguageCode ||
      req.user?.onboarding?.nativeLanguageCode ||
      'tr';
    const levelKey = req.body?.levelKey || req.user?.onboarding?.level || 'beginner';

    const scenario = await roleplayGenerate.createCustomScenario(req.user.id, {
      prompt,
      nativeLanguageCode,
      levelKey,
    });

    res.status(201).json({ ok: true, scenario });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listScenarios,
  saveProgress,
  generateCustomScenario,
};
