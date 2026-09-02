'use strict';

const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

const GOAL_VALUES = new Set([
  'career',
  'travel',
  'livingAbroad',
  'studyingAbroad',
  'other',
]);
const LEVEL_VALUES = new Set([
  'a1', 'a2', 'b1', 'b2', 'c1', 'c2',
  'beginner', 'intermediate', 'advanced',
]);
const PACE_VALUES = new Set(['min5', 'min10', 'min15', 'min30', 'min60']);
const LEGACY_PACE_MAP = {
  light: 'min5',
  recommended: 'min15',
  fast: 'min30',
};

function normalizePace(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (LEGACY_PACE_MAP[raw]) return LEGACY_PACE_MAP[raw];
  return PACE_VALUES.has(raw) ? raw : null;
}
const EXPLANATION_LANGUAGE_VALUES = new Set(['native', 'english']);
const AUTH_PROVIDERS = new Set(['guest', 'google', 'apple']);

/** App locale / learning language codes — open string, max 16 chars (12+ langs). */
function normalizeLocaleCode(value, fallback = 'en') {
  if (typeof value !== 'string') return fallback;
  const code = value.trim().toLowerCase();
  if (!code || code.length > 16) return fallback;
  if (!/^[a-z]{2,3}([-_][a-z0-9]{2,8})?$/i.test(code)) return fallback;
  return code.replace('_', '-');
}

function parseOnboarding(body = {}) {
  const onboarding = body.onboarding && typeof body.onboarding === 'object'
    ? body.onboarding
    : body;

  const nativeLanguageCode = normalizeLocaleCode(
    onboarding.nativeLanguageCode ?? onboarding.native_language_code,
    'tr',
  );
  const targetLanguageCode = normalizeLocaleCode(
    onboarding.targetLanguageCode ?? onboarding.target_language_code,
    'en',
  );

  let goal = onboarding.goal ?? null;
  let level = onboarding.level ?? null;
  let pace = onboarding.pace ?? null;

  if (goal != null) {
    goal = String(goal).trim();
  }
  if (level != null) {
    level = String(level).trim().toLowerCase();
  }
  if (pace != null) {
    pace = normalizePace(pace);
  }

  if (goal != null && !GOAL_VALUES.has(goal)) {
    const err = new Error('Invalid onboarding.goal');
    err.status = 400;
    throw err;
  }
  if (level != null && !LEVEL_VALUES.has(level)) {
    const err = new Error('Invalid onboarding.level');
    err.status = 400;
    throw err;
  }
  if (pace != null && !PACE_VALUES.has(pace)) {
    const err = new Error('Invalid onboarding.pace');
    err.status = 400;
    throw err;
  }

  // Login-first akış: onboarding ekranları atlanınca güvenli varsayılanlar.
  if (goal == null) goal = 'career';
  if (level == null) level = 'a1';
  if (pace == null) pace = 'min15';

  let explanationLanguage =
    onboarding.explanationLanguage ?? onboarding.explanation_language ?? 'native';
  if (typeof explanationLanguage === 'string') {
    explanationLanguage = explanationLanguage.trim().toLowerCase();
  }
  if (!EXPLANATION_LANGUAGE_VALUES.has(explanationLanguage)) {
    const err = new Error('Invalid onboarding.explanationLanguage');
    err.status = 400;
    throw err;
  }

  return {
    nativeLanguageCode,
    targetLanguageCode,
    goal,
    level,
    pace,
    explanationLanguage,
  };
}

function normalizeReminderHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 15;
  return Math.min(23, Math.max(0, Math.trunc(n)));
}

function normalizeReminderMinute(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(59, Math.max(0, Math.trunc(n)));
  return clamped - (clamped % 15);
}

function mapUserRow(row, onboarding) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    authProvider: row.auth_provider,
    isGuest: Boolean(row.is_guest),
    notificationsEnabled: Boolean(row.notifications_enabled),
    dailyReminderHour: normalizeReminderHour(row.daily_reminder_hour),
    dailyReminderMinute: normalizeReminderMinute(row.daily_reminder_minute),
    appLocale: row.app_locale,
    subscriptionStatus: row.subscription_status,
    deletionRequestedAt: row.deletion_requested_at || null,
    accessUntil: row.access_until || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    onboarding: onboarding
      ? {
          nativeLanguageCode: onboarding.native_language_code,
          targetLanguageCode: onboarding.target_language_code,
          goal: onboarding.goal,
          level: onboarding.level,
          pace: onboarding.pace,
          explanationLanguage:
            onboarding.explanation_language || 'native',
          completedAt: onboarding.completed_at,
          personalizationContext: parsePersonalizationContext(
            onboarding.personalization_context,
          ),
        }
      : null,
  };
}

function parsePersonalizationContext(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

module.exports = {
  uuid,
  hashToken,
  createSessionToken,
  normalizeLocaleCode,
  parseOnboarding,
  mapUserRow,
  normalizeReminderHour,
  normalizeReminderMinute,
  AUTH_PROVIDERS,
  GOAL_VALUES,
  LEVEL_VALUES,
  PACE_VALUES,
  normalizePace,
  EXPLANATION_LANGUAGE_VALUES,
};
