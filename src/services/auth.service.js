'use strict';

const { pool } = require('../config/db');
const { API_ERROR_CODES, apiError } = require('../utils/api_error_codes');
const {
  uuid,
  hashToken,
  createSessionToken,
  mapUserRow,
  normalizeLocaleCode,
  normalizeInterests,
  normalizeReminderHour,
  normalizeReminderMinute,
  GOAL_VALUES,
  LEVEL_VALUES,
  normalizePace,
  EXPLANATION_LANGUAGE_VALUES,
} = require('../utils/auth');

const SESSION_DAYS = 60;
/** Refresh if less than this many days remain (sliding renewal). */
const REFRESH_WHEN_DAYS_LEFT = 14;

async function createSession(connection, userId) {
  const token = createSessionToken();
  const id = uuid();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await connection.query(
    `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [id, userId, hashToken(token), expiresAt],
  );

  return { token, expiresAt, sessionId: id };
}

async function findUserById(userId, connection = pool) {
  const [users] = await connection.query(
    'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId],
  );
  if (!users.length) return null;

  const [onboarding] = await connection.query(
    'SELECT * FROM user_onboarding WHERE user_id = ? LIMIT 1',
    [userId],
  );

  return mapUserRow(users[0], onboarding[0] || null);
}

async function findSessionByToken(token) {
  if (!token) return null;
  const [rows] = await pool.query(
    `SELECT s.id AS session_id, s.user_id, s.expires_at, u.*
     FROM user_sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW(3)
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [hashToken(token)],
  );
  if (!rows.length) return null;
  return rows[0];
}

async function findUserBySessionToken(token) {
  const row = await findSessionByToken(token);
  if (!row) return null;

  const { enforceDeletionGrace } = require('./account_deletion.service');
  const allowed = await enforceDeletionGrace(row);
  if (!allowed) return null;

  const [onboarding] = await pool.query(
    'SELECT * FROM user_onboarding WHERE user_id = ? LIMIT 1',
    [row.user_id],
  );

  return mapUserRow(row, onboarding[0] || null);
}

/**
 * Rotate session token. Always issues a fresh 60-day session when called.
 */
async function refreshSessionToken(token) {
  if (!token) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT s.id AS session_id, s.user_id, s.expires_at
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW(3)
         AND u.deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [hashToken(token)],
    );

    if (!rows.length) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    const sessionId = rows[0].session_id;
    const userId = rows[0].user_id;

    await connection.query(
      `UPDATE user_sessions SET revoked_at = NOW(3) WHERE id = ?`,
      [sessionId],
    );

    const session = await createSession(connection, userId);
    await connection.commit();

    const user = await findUserById(userId, connection);
    return { user, token: session.token, expiresAt: session.expiresAt };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function findGuestByDeviceId(deviceId, connection = pool) {
  const [rows] = await connection.query(
    `SELECT u.*
     FROM auth_identities ai
     INNER JOIN users u ON u.id = ai.user_id
     WHERE ai.provider = 'guest'
       AND ai.provider_subject = ?
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [deviceId],
  );
  return rows[0] || null;
}

async function createGuestUser({
  appLocale,
  notificationsEnabled,
  onboarding,
  deviceId,
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const subject =
      typeof deviceId === 'string' ? deviceId.trim() : '';
    if (subject.length >= 8) {
      const existing = await findGuestByDeviceId(subject, connection);
      if (existing) {
        // Onboarding tamamlanıp tekrar guest olunca hatırlatma saatini uygula.
        if (onboarding?.hasReminderTime) {
          await connection.query(
            `UPDATE users
             SET app_locale = ?,
                 notifications_enabled = ?,
                 daily_reminder_hour = ?,
                 daily_reminder_minute = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              appLocale,
              notificationsEnabled ? 1 : 0,
              normalizeReminderHour(onboarding.reminderHour),
              normalizeReminderMinute(onboarding.reminderMinute),
              existing.id,
            ],
          );
        } else {
          await connection.query(
            `UPDATE users
             SET app_locale = ?,
                 notifications_enabled = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [appLocale, notificationsEnabled ? 1 : 0, existing.id],
          );
        }
        const session = await createSession(connection, existing.id);
        await connection.commit();
        const user = await findUserById(existing.id, connection);
        return {
          user,
          token: session.token,
          expiresAt: session.expiresAt,
          reused: true,
        };
      }
    }

    const userId = uuid();
    const identityId = uuid();
    const guestSubject = subject.length >= 8 ? subject : `guest_${userId}`;

    const reminderHour = normalizeReminderHour(
      onboarding?.hasReminderTime ? onboarding.reminderHour : 15,
    );
    const reminderMinute = normalizeReminderMinute(
      onboarding?.hasReminderTime ? onboarding.reminderMinute : 0,
    );

    await connection.query(
      `INSERT INTO users (
         id, display_name, email, auth_provider, is_guest,
         notifications_enabled, app_locale, subscription_status,
         daily_reminder_hour, daily_reminder_minute
       ) VALUES (?, ?, NULL, 'guest', 1, ?, ?, 'free', ?, ?)`,
      [
        userId,
        'Guest',
        notificationsEnabled ? 1 : 0,
        appLocale,
        reminderHour,
        reminderMinute,
      ],
    );

    await connection.query(
      `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email)
       VALUES (?, ?, 'guest', ?, NULL)`,
      [identityId, userId, guestSubject],
    );

    const completed = new Date();

    await connection.query(
      `INSERT INTO user_onboarding (
         user_id, native_language_code, target_language_code,
         goal, interests, level, pace, explanation_language, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        onboarding.nativeLanguageCode,
        onboarding.targetLanguageCode,
        onboarding.goal,
        JSON.stringify(normalizeInterests(onboarding.interests)),
        onboarding.level,
        onboarding.pace,
        onboarding.explanationLanguage || 'native',
        completed,
      ],
    );

    const session = await createSession(connection, userId);
    await connection.commit();

    const user = await findUserById(userId, connection);
    return { user, token: session.token, expiresAt: session.expiresAt };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateUserProfile(userId, patch) {
  const fields = [];
  const values = [];

  if (patch.displayName !== undefined) {
    fields.push('display_name = ?');
    values.push(patch.displayName);
  }
  if (patch.notificationsEnabled !== undefined) {
    fields.push('notifications_enabled = ?');
    values.push(patch.notificationsEnabled ? 1 : 0);
  }
  if (patch.dailyReminderHour !== undefined) {
    fields.push('daily_reminder_hour = ?');
    values.push(patch.dailyReminderHour);
  }
  if (patch.dailyReminderMinute !== undefined) {
    fields.push('daily_reminder_minute = ?');
    values.push(patch.dailyReminderMinute);
  }
  if (patch.appLocale !== undefined) {
    fields.push('app_locale = ?');
    values.push(patch.appLocale);
  }
  if (patch.avatarUrl !== undefined) {
    fields.push('avatar_url = ?');
    values.push(patch.avatarUrl);
  }

  if (!fields.length) {
    return findUserById(userId);
  }

  values.push(userId);
  await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    values,
  );

  return findUserById(userId);
}

async function revokeSessionToken(token) {
  if (!token) return;
  await pool.query(
    `UPDATE user_sessions
     SET revoked_at = NOW(3)
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(token)],
  );
}

/**
 * Upload profile picture to Bunny CDN and persist users.avatar_url.
 */
async function updateUserAvatar(userId, { buffer, contentType }) {
  const { uploadBuffer } = require('./bunny.service');

  const allowed = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);
  const type = String(contentType || '').toLowerCase();
  if (!allowed.has(type)) {
    throw apiError('Only jpeg, png, webp allowed', {
      status: 400,
      code: API_ERROR_CODES.AVATAR_INVALID_TYPE,
    });
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw apiError('Empty image', {
      status: 400,
      code: API_ERROR_CODES.AVATAR_EMPTY,
    });
  }

  // ~5 MB hard limit
  if (buffer.length > 5 * 1024 * 1024) {
    throw apiError('Image too large (max 5MB)', {
      status: 400,
      code: API_ERROR_CODES.AVATAR_TOO_LARGE,
    });
  }

  const ext =
    type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const objectPath = `users/${userId}/avatar.${ext}`;
  const avatarUrl = await uploadBuffer(objectPath, buffer, type);

  await pool.query(
    `UPDATE users SET avatar_url = ? WHERE id = ? AND deleted_at IS NULL`,
    [avatarUrl, userId],
  );

  return findUserById(userId);
}

async function upsertOnboarding(connection, userId, onboarding) {
  if (!onboarding) return;
  const completed = new Date();

  await connection.query(
    `INSERT INTO user_onboarding (
       user_id, native_language_code, target_language_code,
       goal, interests, level, pace, explanation_language, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       native_language_code = VALUES(native_language_code),
       target_language_code = VALUES(target_language_code),
       goal = COALESCE(VALUES(goal), goal),
       interests = COALESCE(VALUES(interests), interests),
       level = COALESCE(VALUES(level), level),
       pace = COALESCE(VALUES(pace), pace),
       explanation_language = COALESCE(VALUES(explanation_language), explanation_language),
       completed_at = COALESCE(VALUES(completed_at), completed_at)`,
    [
      userId,
      onboarding.nativeLanguageCode,
      onboarding.targetLanguageCode,
      onboarding.goal,
      JSON.stringify(normalizeInterests(onboarding.interests)),
      onboarding.level,
      onboarding.pace,
      onboarding.explanationLanguage || 'native',
      completed,
    ],
  );
}

async function updateUserOnboarding(userId, patch = {}) {
  const [rows] = await pool.query(
    'SELECT * FROM user_onboarding WHERE user_id = ? LIMIT 1',
    [userId],
  );
  if (!rows.length) {
    const err = new Error('Onboarding profile not found');
    err.status = 404;
    throw err;
  }

  const fields = [];
  const values = [];
  if (patch.nativeLanguageCode !== undefined) {
    fields.push('native_language_code = ?');
    values.push(normalizeLocaleCode(patch.nativeLanguageCode, 'tr'));
  }
  if (patch.targetLanguageCode !== undefined) {
    fields.push('target_language_code = ?');
    values.push(normalizeLocaleCode(patch.targetLanguageCode, 'en'));
  }
  if (patch.goal !== undefined) {
    if (!GOAL_VALUES.has(patch.goal)) {
      const err = new Error('Invalid onboarding.goal');
      err.status = 400;
      throw err;
    }
    fields.push('goal = ?');
    values.push(patch.goal);
  }
  if (patch.interests !== undefined) {
    fields.push('interests = ?');
    values.push(JSON.stringify(normalizeInterests(patch.interests)));
  }
  if (patch.level !== undefined) {
    if (!LEVEL_VALUES.has(patch.level)) {
      const err = new Error('Invalid onboarding.level');
      err.status = 400;
      throw err;
    }
    fields.push('level = ?');
    values.push(patch.level);
  }
  if (patch.pace !== undefined) {
    const normalized = normalizePace(patch.pace);
    if (normalized == null) {
      const err = new Error('Invalid onboarding.pace');
      err.status = 400;
      throw err;
    }
    fields.push('pace = ?');
    values.push(normalized);
  }
  if (patch.explanationLanguage !== undefined) {
    if (!EXPLANATION_LANGUAGE_VALUES.has(patch.explanationLanguage)) {
      const err = new Error('Invalid onboarding.explanationLanguage');
      err.status = 400;
      throw err;
    }
    fields.push('explanation_language = ?');
    values.push(patch.explanationLanguage);
  }
  if (patch.personalizationContext !== undefined) {
    fields.push('personalization_context = ?');
    values.push(JSON.stringify(patch.personalizationContext));
  }

  if (!fields.length) {
    return findUserById(userId);
  }

  values.push(userId);
  await pool.query(
    `UPDATE user_onboarding SET ${fields.join(', ')} WHERE user_id = ?`,
    values,
  );
  return findUserById(userId);
}

async function saveOnboardingPersonalization(userId, { messages, summary }) {
  const sanitizedMessages = (Array.isArray(messages) ? messages : [])
    .slice(-40)
    .map((m) => ({
      role: m?.role === 'user' ? 'user' : 'assistant',
      content: String(m?.content || '').trim().slice(0, 4000),
    }))
    .filter((m) => m.content.length > 0);

  const context = {
    messages: sanitizedMessages,
    summary: summary ? String(summary).trim().slice(0, 2000) : undefined,
    savedAt: new Date().toISOString(),
  };

  return updateUserOnboarding(userId, { personalizationContext: context });
}

/**
 * Login / register via Google or Apple identity.
 */
async function loginWithProvider({
  provider,
  subject,
  email,
  displayName,
  avatarUrl,
  appLocale,
  notificationsEnabled,
  onboarding,
}) {
  if (provider !== 'google' && provider !== 'apple') {
    const err = new Error('Unsupported provider');
    err.status = 400;
    throw err;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [identities] = await connection.query(
      `SELECT * FROM auth_identities
       WHERE provider = ? AND provider_subject = ?
       LIMIT 1`,
      [provider, subject],
    );

    let userId;

    if (identities.length) {
      userId = identities[0].user_id;
      await connection.query(
        `UPDATE users SET
           display_name = COALESCE(?, display_name),
           email = COALESCE(?, email),
           avatar_url = COALESCE(?, avatar_url),
           auth_provider = ?,
           is_guest = 0,
           app_locale = COALESCE(?, app_locale)
         WHERE id = ? AND deleted_at IS NULL`,
        [displayName, email, avatarUrl, provider, appLocale, userId],
      );
      await connection.query(
        `UPDATE auth_identities SET email = COALESCE(?, email)
         WHERE id = ?`,
        [email, identities[0].id],
      );
    } else {
      let existingUserId = null;
      if (email) {
        const [byEmail] = await connection.query(
          `SELECT id FROM users
           WHERE email = ? AND deleted_at IS NULL
           LIMIT 1`,
          [email],
        );
        if (byEmail.length) existingUserId = byEmail[0].id;
      }

      if (existingUserId) {
        userId = existingUserId;
        await connection.query(
          `UPDATE users SET
             display_name = COALESCE(?, display_name),
             avatar_url = COALESCE(?, avatar_url),
             auth_provider = ?,
             is_guest = 0,
             app_locale = COALESCE(?, app_locale)
           WHERE id = ?`,
          [displayName, avatarUrl, provider, appLocale, userId],
        );
      } else {
        userId = uuid();
        const reminderHour = normalizeReminderHour(
          onboarding?.hasReminderTime ? onboarding.reminderHour : 15,
        );
        const reminderMinute = normalizeReminderMinute(
          onboarding?.hasReminderTime ? onboarding.reminderMinute : 0,
        );
        await connection.query(
          `INSERT INTO users (
             id, display_name, email, avatar_url, auth_provider, is_guest,
             notifications_enabled, app_locale, subscription_status,
             daily_reminder_hour, daily_reminder_minute
           ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'free', ?, ?)`,
          [
            userId,
            displayName || (provider === 'apple' ? 'Apple User' : 'Google User'),
            email,
            avatarUrl,
            provider,
            notificationsEnabled ? 1 : 0,
            appLocale,
            reminderHour,
            reminderMinute,
          ],
        );
      }

      await connection.query(
        `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), userId, provider, subject, email],
      );
    }

    await upsertOnboarding(connection, userId, onboarding);

    if (onboarding?.hasReminderTime) {
      await connection.query(
        `UPDATE users
         SET daily_reminder_hour = ?,
             daily_reminder_minute = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`,
        [
          normalizeReminderHour(onboarding.reminderHour),
          normalizeReminderMinute(onboarding.reminderMinute),
          userId,
        ],
      );
    }

    const session = await createSession(connection, userId);
    await connection.commit();

    const user = await findUserById(userId, connection);
    return { user, token: session.token, expiresAt: session.expiresAt };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  SESSION_DAYS,
  REFRESH_WHEN_DAYS_LEFT,
  createGuestUser,
  findUserById,
  findUserBySessionToken,
  findSessionByToken,
  refreshSessionToken,
  updateUserProfile,
  updateUserAvatar,
  revokeSessionToken,
  loginWithProvider,
  updateUserOnboarding,
  saveOnboardingPersonalization,
};
