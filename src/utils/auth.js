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
const INTEREST_VALUES = new Set([
  'travel',
  'shopping',
  'food',
  'popCulture',
  'film',
  'music',
  'sport',
  'technology',
  'science',
  'health',
  'fashion',
  'art',
  'literature',
  'history',
  'culture',
  'astronomy',
  'pet',
  'socialMedia',
  'entrepreneur',
]);
const LEVEL_VALUES = new Set([
  'a1', 'a2', 'b1', 'b2', 'c1', 'c2',
  'beginner', 'intermediate', 'advanced',
]);
const PACE_VALUES = new Set([
  'month1',
  'month2_3',
  'month6',
  'year1',
  'relaxed',
]);
const LEGACY_PACE_MAP = {
  light: 'relaxed',
  recommended: 'month6',
  fast: 'month2_3',
  min5: 'relaxed',
  min10: 'year1',
  min15: 'month6',
  min30: 'month2_3',
  min60: 'month1',
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

function normalizeInterests(raw) {
  if (raw == null) return [];
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch (_) {
      list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || !INTEREST_VALUES.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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
  const interests = normalizeInterests(
    onboarding.interests ?? onboarding.interestIds ?? null,
  );

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
  if (pace == null) pace = 'month2_3';

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

  const reminderHourRaw =
    onboarding.reminderHour ??
    onboarding.reminder_hour ??
    onboarding.dailyReminderHour ??
    onboarding.daily_reminder_hour;
  const reminderMinuteRaw =
    onboarding.reminderMinute ??
    onboarding.reminder_minute ??
    onboarding.dailyReminderMinute ??
    onboarding.daily_reminder_minute;

  const practiceTimeOfDayRaw =
    onboarding.practiceTimeOfDay ?? onboarding.practice_time_of_day ?? null;
  const practiceTimeOfDay =
    typeof practiceTimeOfDayRaw === 'string' && practiceTimeOfDayRaw.trim()
      ? practiceTimeOfDayRaw.trim().toLowerCase()
      : null;

  return {
    nativeLanguageCode,
    targetLanguageCode,
    goal,
    interests,
    level,
    pace,
    explanationLanguage,
    reminderHour: normalizeReminderHour(
      reminderHourRaw !== undefined && reminderHourRaw !== null
        ? reminderHourRaw
        : 15,
    ),
    reminderMinute: normalizeReminderMinute(
      reminderMinuteRaw !== undefined && reminderMinuteRaw !== null
        ? reminderMinuteRaw
        : 0,
    ),
    hasReminderTime:
      reminderHourRaw !== undefined && reminderHourRaw !== null,
    practiceTimeOfDay,
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
          interests: normalizeInterests(onboarding.interests),
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
  normalizeInterests,
  parseOnboarding,
  mapUserRow,
  normalizeReminderHour,
  normalizeReminderMinute,
  AUTH_PROVIDERS,
  GOAL_VALUES,
  INTEREST_VALUES,
  LEVEL_VALUES,
  PACE_VALUES,
  normalizePace,
  EXPLANATION_LANGUAGE_VALUES,
};
