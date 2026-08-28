'use strict';

const { pool } = require('../config/db');
const { listSeedNotifications } = require('../data/notifications-seed');

async function ensureReadTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_reads (
      user_id CHAR(36) NOT NULL,
      notification_id VARCHAR(64) NOT NULL,
      read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, notification_id),
      KEY idx_unr_user (user_id),
      CONSTRAINT fk_unr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureDismissTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_dismissals (
      user_id CHAR(36) NOT NULL,
      notification_id VARCHAR(64) NOT NULL,
      dismissed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, notification_id),
      KEY idx_und_user (user_id),
      CONSTRAINT fk_und_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function listForUser(userId, { limit = 20 } = {}) {
  await ensureReadTable();
  await ensureDismissTable();
  const max = Math.max(1, Math.min(Number(limit) || 20, 50));
  const seed = listSeedNotifications().slice(0, max);
  const ids = seed.map((row) => row.id);
  if (!ids.length) {
    return { notifications: [], unreadCount: 0 };
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [reads] = await pool.query(
    `SELECT notification_id, read_at
     FROM user_notification_reads
     WHERE user_id = ? AND notification_id IN (${placeholders})`,
    [userId, ...ids],
  );
  const [dismissed] = await pool.query(
    `SELECT notification_id
     FROM user_notification_dismissals
     WHERE user_id = ? AND notification_id IN (${placeholders})`,
    [userId, ...ids],
  );

  const readMap = new Map(
    reads.map((row) => [row.notification_id, row.read_at]),
  );
  const dismissedSet = new Set(dismissed.map((row) => row.notification_id));

  const visible = seed
    .filter((row) => !dismissedSet.has(row.id))
    .map((row) => ({
      ...row,
      readAt: readMap.get(row.id) || null,
    }));

  const unreadCount = visible.filter((row) => !row.readAt).length;

  return { notifications: visible, unreadCount };
}

async function markRead(userId, notificationId) {
  await ensureReadTable();
  await pool.query(
    `INSERT INTO user_notification_reads (user_id, notification_id, read_at)
     VALUES (?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE read_at = UTC_TIMESTAMP(3)`,
    [userId, notificationId],
  );
}

async function markAllRead(userId) {
  await ensureReadTable();
  const seed = listSeedNotifications();
  for (const row of seed) {
    await markRead(userId, row.id);
  }
}

async function dismiss(userId, notificationId) {
  await ensureDismissTable();
  await pool.query(
    `INSERT INTO user_notification_dismissals (user_id, notification_id, dismissed_at)
     VALUES (?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE dismissed_at = UTC_TIMESTAMP(3)`,
    [userId, notificationId],
  );
}

module.exports = {
  listForUser,
  markRead,
  markAllRead,
  dismiss,
};
