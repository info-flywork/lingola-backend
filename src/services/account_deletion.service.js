'use strict';

const { pool } = require('../config/db');
const { uuid } = require('../utils/auth');

const REASON_CODES = new Set([
  'ai_characters',
  'video_issues',
  'pricing',
  'no_match',
  'short_trial',
  'other',
]);

const OFFER_TYPES = new Set(['monthly_plan', 'discount_60']);

function findUserByIdLazy(userId) {
  return require('./auth.service').findUserById(userId);
}

function graceDaysForSubscription(status) {
  if (status === 'premium') return 30;
  return 7;
}

function computeAccessUntil(subscriptionStatus) {
  const days = graceDaysForSubscription(subscriptionStatus);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function recordRetentionOffer(userId, offerType, action) {
  if (!OFFER_TYPES.has(offerType)) {
    const err = new Error('Invalid offerType');
    err.status = 400;
    throw err;
  }
  if (!['shown', 'accepted', 'declined'].includes(action)) {
    const err = new Error('Invalid action');
    err.status = 400;
    throw err;
  }

  await pool.query(
    `INSERT INTO retention_offer_events (id, user_id, offer_type, action)
     VALUES (?, ?, ?, ?)`,
    [uuid(), userId, offerType, action],
  );

  if (action === 'accepted') {
    await pool.query(
      `UPDATE users SET
         deletion_requested_at = NULL,
         access_until = NULL,
         subscription_status = CASE
           WHEN subscription_status = 'free' THEN 'premium'
           ELSE subscription_status
         END
       WHERE id = ? AND deleted_at IS NULL`,
      [userId],
    );
  }

  return findUserByIdLazy(userId);
}

/**
 * Schedule account deletion after survey. User keeps access until access_until.
 */
async function requestAccountDeletion(userId, {
  reasonCode,
  reasonLabel,
  message,
}) {
  if (!REASON_CODES.has(reasonCode)) {
    const err = new Error('Invalid reasonCode');
    err.status = 400;
    throw err;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [users] = await connection.query(
      `SELECT * FROM users
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [userId],
    );
    if (!users.length) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const user = users[0];
    const accessUntil = computeAccessUntil(user.subscription_status);

    await connection.query(
      `INSERT INTO account_deletion_feedback
         (id, user_id, reason_code, reason_label, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuid(),
        userId,
        reasonCode,
        reasonLabel || null,
        message && String(message).trim() ? String(message).trim().slice(0, 2000) : null,
      ],
    );

    // Decline open retention offers for funnel analytics.
    await connection.query(
      `INSERT INTO retention_offer_events (id, user_id, offer_type, action)
       VALUES (?, ?, 'monthly_plan', 'declined'),
              (?, ?, 'discount_60', 'declined')`,
      [uuid(), userId, uuid(), userId],
    );

    await connection.query(
      `UPDATE users SET
         deletion_requested_at = NOW(3),
         access_until = ?,
         subscription_status = CASE
           WHEN subscription_status = 'premium' THEN 'passive'
           ELSE subscription_status
         END
       WHERE id = ?`,
      [accessUntil, userId],
    );

    await connection.commit();

    const mapped = await findUserByIdLazy(userId);
    return { user: mapped, accessUntil };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function reactivateAccount(userId) {
  const [users] = await pool.query(
    `SELECT * FROM users
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [userId],
  );
  if (!users.length) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const row = users[0];
  if (!row.deletion_requested_at) {
    return findUserByIdLazy(userId);
  }

  if (row.access_until && new Date(row.access_until) < new Date()) {
    const err = new Error('Reactivation window expired');
    err.status = 410;
    throw err;
  }

  await pool.query(
    `UPDATE users SET
       deletion_requested_at = NULL,
       access_until = NULL,
       subscription_status = CASE
         WHEN subscription_status = 'passive' THEN 'premium'
         ELSE subscription_status
       END
     WHERE id = ?`,
    [userId],
  );

  return findUserByIdLazy(userId);
}

/**
 * Finalize soft-delete when grace period ends.
 * Anonymizes email and removes auth identities so the same Google/Apple can re-register.
 */
async function finalizeExpiredDeletions(limit = 50) {
  const [rows] = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND deletion_requested_at IS NOT NULL
       AND access_until IS NOT NULL
       AND access_until < NOW(3)
     LIMIT ?`,
    [limit],
  );

  for (const row of rows) {
    await finalizeUserDeletion(row.id);
  }
  return rows.length;
}

async function finalizeUserDeletion(userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const tombstoneEmail = `deleted+${userId}@lingola.invalid`;

    await connection.query(
      `UPDATE user_sessions
       SET revoked_at = NOW(3)
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    );

    await connection.query(
      `DELETE FROM auth_identities WHERE user_id = ?`,
      [userId],
    );

    await connection.query(
      `UPDATE users SET
         deleted_at = NOW(3),
         email = ?,
         display_name = 'Deleted User',
         avatar_url = NULL,
         is_guest = 1,
         auth_provider = 'guest',
         notifications_enabled = 0
       WHERE id = ? AND deleted_at IS NULL`,
      [tombstoneEmail, userId],
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * If user is past access_until, finalize and return null (caller treats as unauthorized).
 */
async function enforceDeletionGrace(userRow) {
  if (!userRow) return null;
  if (userRow.deleted_at) return null;

  if (
    userRow.deletion_requested_at &&
    userRow.access_until &&
    new Date(userRow.access_until) < new Date()
  ) {
    await finalizeUserDeletion(userRow.id);
    return null;
  }
  return userRow;
}

module.exports = {
  REASON_CODES,
  OFFER_TYPES,
  recordRetentionOffer,
  requestAccountDeletion,
  reactivateAccount,
  finalizeExpiredDeletions,
  finalizeUserDeletion,
  enforceDeletionGrace,
  computeAccessUntil,
};
