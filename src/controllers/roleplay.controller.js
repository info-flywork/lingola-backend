'use strict';

const roleplay = require('../services/roleplay.service');

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

module.exports = {
  listScenarios,
  saveProgress,
};
