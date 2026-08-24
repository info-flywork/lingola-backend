'use strict';

const { pool } = require('../config/db');
const { listScenarios } = require('../data/roleplay-catalog');

const SCENARIO_MATCH = {
  coffee: /coffee|kahve|cafe|kafede/i,
  directions: /direction|yol|street|sokak/i,
  interview: /interview|görüşme|job/i,
};

function progressFromMessageCount(count) {
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  if (n >= 10) return 1;
  if (n >= 4) return 0.6;
  return Math.min(0.4, n * 0.1);
}

async function fetchUserProgressMap(userId) {
  const [rows] = await pool.query(
    `SELECT s.title, COUNT(m.id) AS user_messages
     FROM tutor_chat_sessions s
     LEFT JOIN tutor_chat_messages m
       ON m.session_id = s.id AND m.role = 'user'
     WHERE s.user_id = ?
       AND s.title LIKE 'Role Play:%'
     GROUP BY s.id, s.title`,
    [userId],
  );

  const best = {};
  for (const row of rows) {
    const title = String(row.title || '');
    for (const [scenarioId, pattern] of Object.entries(SCENARIO_MATCH)) {
      if (!pattern.test(title)) continue;
      const progress = progressFromMessageCount(row.user_messages);
      best[scenarioId] = Math.max(best[scenarioId] || 0, progress);
    }
  }
  return best;
}

async function listScenariosForUser(userId) {
  const progressMap = await fetchUserProgressMap(userId);
  return listScenarios()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => ({
      ...row,
      progressPercent: progressMap[row.id] || 0,
    }));
}

module.exports = {
  listScenariosForUser,
};
