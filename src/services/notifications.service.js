'use strict';

const { pool } = require('../config/db');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      client_key VARCHAR(128) NOT NULL,
      notification_type VARCHAR(64) NOT NULL DEFAULT 'reminder',
      title VARCHAR(255) NOT NULL,
      body TEXT NULL,
      icon_asset VARCHAR(255) NULL,
      icon_bg VARCHAR(16) NULL,
      title_color VARCHAR(16) NULL,
      delivered_at DATETIME(3) NOT NULL,
      read_at DATETIME(3) NULL,
      dismissed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_user_notif_client (user_id, client_key),
      KEY idx_user_notif_user_delivered (user_id, delivered_at DESC),
      CONSTRAINT fk_user_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function mapRow(row) {
  return {
    id: row.client_key,
    type: row.notification_type,
    title: row.title,
    body: row.body || '',
    iconAsset: row.icon_asset || '',
    iconBg: row.icon_bg || '',
    titleColor: row.title_color || null,
    deliveredAt: row.delivered_at,
    readAt: row.read_at || null,
  };
}

function parseDeliveredAt(value) {
  if (!value) return new Date();
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

async function listForUser(userId, { limit = 50 } = {}) {
  await ensureTable();
  const max = Math.max(1, Math.min(Number(limit) || 50, 100));
  const [rows] = await pool.query(
    `SELECT client_key, notification_type, title, body,
            icon_asset, icon_bg, title_color, delivered_at, read_at
     FROM user_notifications
     WHERE user_id = ? AND dismissed_at IS NULL
     ORDER BY delivered_at DESC
     LIMIT ?`,
    [userId, max],
  );

  const notifications = rows.map(mapRow);
  const unreadCount = notifications.filter((row) => !row.readAt).length;
  return { notifications, unreadCount };
}

async function upsert(userId, item) {
  await ensureTable();
  const clientKey = String(item.clientKey || item.id || '').trim();
  if (!clientKey || !item.title) return null;

  const deliveredAt = parseDeliveredAt(item.deliveredAt || item.deliveredAtIso);
  await pool.query(
    `INSERT INTO user_notifications
      (user_id, client_key, notification_type, title, body,
       icon_asset, icon_bg, title_color, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       notification_type = VALUES(notification_type),
       title = VALUES(title),
       body = VALUES(body),
       icon_asset = VALUES(icon_asset),
       icon_bg = VALUES(icon_bg),
       title_color = VALUES(title_color),
       delivered_at = VALUES(delivered_at)`,
    [
      userId,
      clientKey,
      item.notificationType || item.type || 'reminder',
      String(item.title).slice(0, 255),
      item.body != null ? String(item.body) : null,
      item.iconAsset || null,
      item.iconBg || null,
      item.titleColor || null,
      deliveredAt,
    ],
  );
  return clientKey;
}

async function record(userId, item) {
  const key = await upsert(userId, item);
  return key ? { id: key } : null;
}

async function syncBatch(userId, items) {
  if (!Array.isArray(items) || !items.length) {
    return { synced: 0 };
  }
  let synced = 0;
  for (const item of items) {
    const key = await upsert(userId, item);
    if (key) synced += 1;
  }
  return { synced };
}

async function markRead(userId, notificationId) {
  await ensureTable();
  await pool.query(
    `UPDATE user_notifications
     SET read_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND client_key = ? AND dismissed_at IS NULL`,
    [userId, notificationId],
  );
}

async function markAllRead(userId) {
  await ensureTable();
  await pool.query(
    `UPDATE user_notifications
     SET read_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND dismissed_at IS NULL AND read_at IS NULL`,
    [userId],
  );
}

async function dismiss(userId, notificationId) {
  await ensureTable();
  await pool.query(
    `UPDATE user_notifications
     SET dismissed_at = UTC_TIMESTAMP(3)
     WHERE user_id = ? AND client_key = ?`,
    [userId, notificationId],
  );
}

module.exports = {
  listForUser,
  record,
  syncBatch,
  markRead,
  markAllRead,
  dismiss,
};
