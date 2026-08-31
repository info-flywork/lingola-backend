'use strict';

const { pool } = require('../config/db');
const { listScenarios } = require('../data/roleplay-catalog');

function progressFromElapsed(elapsedSeconds, minutes = 8) {
  const total = Math.max(1, Number(minutes) || 8) * 60;
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  return Math.min(1, elapsed / total);
}

function scenarioById(scenarioId) {
  return listScenarios().find((row) => row.id === scenarioId) || null;
}

async function fetchUserProgressMap(userId) {
  const [rows] = await pool.query(
    `SELECT scenario_id, elapsed_seconds, progress_percent, session_id, completed_at
     FROM roleplay_progress
     WHERE user_id = ?`,
    [userId],
  );

  const map = {};
  for (const row of rows) {
    map[row.scenario_id] = {
      elapsedSeconds: Number(row.elapsed_seconds) || 0,
      progressPercent: Number(row.progress_percent) || 0,
      sessionId: row.session_id || null,
      completedAt: row.completed_at || null,
    };
  }
  return map;
}

async function recordProgress(
  userId,
  scenarioId,
  { sessionId, additionalSeconds } = {},
) {
  const scenario = scenarioById(scenarioId);
  if (!scenario) {
    const err = new Error('Scenario not found');
    err.status = 404;
    throw err;
  }

  const add = Math.max(0, Math.floor(Number(additionalSeconds) || 0));
  const [existing] = await pool.query(
    `SELECT elapsed_seconds, completed_at
     FROM roleplay_progress
     WHERE user_id = ? AND scenario_id = ?
     LIMIT 1`,
    [userId, scenarioId],
  );

  const prevElapsed = existing.length ? Number(existing[0].elapsed_seconds) || 0 : 0;
  const totalElapsed = prevElapsed + add;
  const progress = progressFromElapsed(totalElapsed, scenario.minutes);
  const completedAt =
    progress >= 1
      ? existing[0]?.completed_at || new Date()
      : existing[0]?.completed_at || null;

  await pool.query(
    `INSERT INTO roleplay_progress
       (user_id, scenario_id, session_id, elapsed_seconds, progress_percent, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       session_id = COALESCE(VALUES(session_id), session_id),
       elapsed_seconds = VALUES(elapsed_seconds),
       progress_percent = GREATEST(progress_percent, VALUES(progress_percent)),
       completed_at = COALESCE(completed_at, VALUES(completed_at)),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      userId,
      scenarioId,
      sessionId || null,
      totalElapsed,
      progress,
      completedAt,
    ],
  );

  return {
    scenarioId,
    elapsedSeconds: totalElapsed,
    progressPercent: progress,
    sessionId: sessionId || null,
    completed: progress >= 1,
  };
}

async function listScenariosForUser(userId) {
  const progressMap = await fetchUserProgressMap(userId);
  return listScenarios()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => {
      const progress = progressMap[row.id] || {};
      return {
        ...row,
        elapsedSeconds: progress.elapsedSeconds || 0,
        progressPercent: progress.progressPercent || 0,
        sessionId: progress.sessionId || null,
        completed: Boolean(progress.completedAt) || (progress.progressPercent || 0) >= 1,
      };
    });
}

module.exports = {
  listScenariosForUser,
  recordProgress,
  progressFromElapsed,
};
