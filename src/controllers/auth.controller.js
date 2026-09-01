'use strict';

const {
  createGuestUser,
  updateUserProfile,
  updateUserAvatar,
  updateUserOnboarding,
  saveOnboardingPersonalization,
  revokeSessionToken,
  loginWithProvider,
  refreshSessionToken,
} = require('../services/auth.service');
const {
  parseOnboarding,
  normalizeLocaleCode,
  EXPLANATION_LANGUAGE_VALUES,
  GOAL_VALUES,
  LEVEL_VALUES,
  PACE_VALUES,
} = require('../utils/auth');
const {
  resolveIdentity,
} = require('../services/firebase_token.service');
const { API_ERROR_CODES, apiError } = require('../utils/api_error_codes');

async function guest(req, res, next) {
  try {
    const body = req.body || {};
    const onboarding = parseOnboarding(body);
    const appLocale = normalizeLocaleCode(body.appLocale ?? body.app_locale, 'en');
    const notificationsEnabled =
      body.notificationsEnabled ?? body.notifications_enabled ?? true;
    const deviceId = String(body.deviceId ?? body.device_id ?? '').trim();
    if (deviceId.length > 0 && deviceId.length < 8) {
      return res.status(400).json({
        ok: false,
        error: 'deviceId must be at least 8 characters',
      });
    }

    const result = await createGuestUser({
      appLocale,
      notificationsEnabled: Boolean(notificationsEnabled),
      onboarding,
      deviceId: deviceId || null,
    });

    res.status(result.reused ? 200 : 201).json({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
    console.log(
      `[auth] guest ok user=${result.user?.id} locale=${appLocale}` +
        ` reused=${Boolean(result.reused)} device=${deviceId ? 'yes' : 'no'}`,
    );
  } catch (err) {
    next(err);
  }
}

async function providerLogin(req, res, next, expectedProvider) {
  try {
    const body = req.body || {};
    const idToken = body.idToken || body.id_token;
    if (!idToken || typeof idToken !== 'string') {
      const err = new Error('idToken is required');
      err.status = 400;
      throw err;
    }

    const identity = await resolveIdentity(idToken, expectedProvider);

    if (identity.provider !== expectedProvider) {
      const err = new Error(
        `Token provider mismatch: expected ${expectedProvider}, got ${identity.provider}`,
      );
      err.status = 401;
      throw err;
    }

    const onboarding = parseOnboarding(body);
    const appLocale = normalizeLocaleCode(body.appLocale ?? body.app_locale, 'en');
    const notificationsEnabled =
      body.notificationsEnabled ?? body.notifications_enabled ?? true;

    const result = await loginWithProvider({
      provider: identity.provider,
      subject: identity.subject,
      email: identity.email || body.email || null,
      displayName:
        identity.displayName ||
        body.displayName ||
        body.fullName ||
        null,
      avatarUrl: identity.avatarUrl || body.avatarUrl || null,
      appLocale,
      notificationsEnabled: Boolean(notificationsEnabled),
      onboarding,
    });

    res.status(200).json({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
    console.log(
      `[auth] ${expectedProvider} ok user=${result.user?.id} locale=${appLocale}`,
    );
  } catch (err) {
    if (!err.status) err.status = 401;
    next(err);
  }
}

function google(req, res, next) {
  return providerLogin(req, res, next, 'google');
}

function apple(req, res, next) {
  return providerLogin(req, res, next, 'apple');
}

async function me(req, res) {
  res.json({ ok: true, user: req.user });
}

async function refresh(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const bodyToken = req.body?.token || req.body?.accessToken;
    const token = (match && match[1].trim()) || bodyToken;
    if (!token || typeof token !== 'string') {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    const result = await refreshSessionToken(token.trim());
    res.json({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
  } catch (err) {
    if (!err.status) err.status = 401;
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.displayName !== undefined || body.display_name !== undefined) {
      patch.displayName = String(body.displayName ?? body.display_name).trim() || null;
    }
    if (
      body.notificationsEnabled !== undefined ||
      body.notifications_enabled !== undefined
    ) {
      patch.notificationsEnabled = Boolean(
        body.notificationsEnabled ?? body.notifications_enabled,
      );
    }
    if (body.appLocale !== undefined || body.app_locale !== undefined) {
      patch.appLocale = normalizeLocaleCode(
        body.appLocale ?? body.app_locale,
        req.user.appLocale,
      );
    }
    if (body.avatarUrl !== undefined || body.avatar_url !== undefined) {
      patch.avatarUrl = body.avatarUrl ?? body.avatar_url;
    }

    const user = await updateUserProfile(req.user.id, patch);
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

async function updateNotifications(req, res, next) {
  try {
    const body = req.body || {};
    if (
      body.notificationsEnabled === undefined &&
      body.notifications_enabled === undefined &&
      body.enabled === undefined
    ) {
      const err = apiError('notificationsEnabled is required', {
        status: 400,
        code: API_ERROR_CODES.NOTIFICATIONS_REQUIRED,
      });
      throw err;
    }

    const enabled = Boolean(
      body.notificationsEnabled ?? body.notifications_enabled ?? body.enabled,
    );
    const user = await updateUserProfile(req.user.id, {
      notificationsEnabled: enabled,
    });
    res.json({
      ok: true,
      notificationsEnabled: user.notificationsEnabled,
      user,
    });
  } catch (err) {
    next(err);
  }
}

async function updateOnboarding(req, res, next) {
  try {
    const body = req.body || {};
    const patch = {};

    const onboardingBody =
      body.onboarding && typeof body.onboarding === 'object'
        ? body.onboarding
        : body;

    const nativeRaw =
      onboardingBody.nativeLanguageCode ??
      onboardingBody.native_language_code ??
      undefined;
    if (nativeRaw !== undefined) {
      patch.nativeLanguageCode = normalizeLocaleCode(nativeRaw, 'tr');
    }

    const targetRaw =
      onboardingBody.targetLanguageCode ??
      onboardingBody.target_language_code ??
      undefined;
    if (targetRaw !== undefined) {
      patch.targetLanguageCode = normalizeLocaleCode(targetRaw, 'en');
    }

    const goalRaw = onboardingBody.goal ?? undefined;
    if (goalRaw !== undefined) {
      const value = String(goalRaw).trim();
      if (!GOAL_VALUES.has(value)) {
        const err = new Error('Invalid onboarding.goal');
        err.status = 400;
        throw err;
      }
      patch.goal = value;
    }

    const levelRaw = onboardingBody.level ?? undefined;
    if (levelRaw !== undefined) {
      const value = String(levelRaw).trim().toLowerCase();
      if (!LEVEL_VALUES.has(value)) {
        const err = new Error('Invalid onboarding.level');
        err.status = 400;
        throw err;
      }
      patch.level = value;
    }

    const paceRaw = onboardingBody.pace ?? undefined;
    if (paceRaw !== undefined) {
      const value = String(paceRaw).trim();
      if (!PACE_VALUES.has(value)) {
        const err = new Error('Invalid onboarding.pace');
        err.status = 400;
        throw err;
      }
      patch.pace = value;
    }

    const raw =
      onboardingBody.explanationLanguage ??
      onboardingBody.explanation_language ??
      undefined;
    if (raw !== undefined) {
      const value = String(raw).trim().toLowerCase();
      if (!EXPLANATION_LANGUAGE_VALUES.has(value)) {
        const err = new Error('Invalid explanationLanguage');
        err.status = 400;
        throw err;
      }
      patch.explanationLanguage = value;
    }

    if (!Object.keys(patch).length) {
      const err = new Error('No onboarding fields to update');
      err.status = 400;
      throw err;
    }
    const user = await updateUserOnboarding(req.user.id, patch);
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

async function savePersonalization(req, res, next) {
  try {
    const body = req.body || {};
    const messages = body.messages;
    if (!Array.isArray(messages)) {
      return res.status(400).json({
        ok: false,
        error: 'messages array is required',
      });
    }
    const summary = body.summary ?? body.notes ?? undefined;
    const user = await saveOnboardingPersonalization(req.user.id, {
      messages,
      summary,
    });
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

async function uploadAvatar(req, res, next) {
  try {
    const body = req.body || {};
    const contentType = String(
      body.contentType || body.content_type || 'image/jpeg',
    ).toLowerCase();
    const raw = body.imageBase64 || body.image_base64 || body.data;
    if (!raw || typeof raw !== 'string') {
      throw apiError('imageBase64 is required', {
        status: 400,
        code: API_ERROR_CODES.IMAGE_REQUIRED,
      });
    }

    const base64 = raw.includes(',') ? raw.split(',').pop() : raw;
    const buffer = Buffer.from(base64, 'base64');
    const user = await updateUserAvatar(req.user.id, { buffer, contentType });
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await revokeSessionToken(req.accessToken);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function retentionOffer(req, res, next) {
  try {
    const {
      recordRetentionOffer,
    } = require('../services/account_deletion.service');
    const body = req.body || {};
    const offerType = body.offerType || body.offer_type;
    const action = body.action || 'accepted';
    const user = await recordRetentionOffer(req.user.id, offerType, action);
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const {
      requestAccountDeletion,
    } = require('../services/account_deletion.service');
    const body = req.body || {};
    const reasonCode = body.reasonCode || body.reason_code;
    const reasonLabel = body.reasonLabel || body.reason_label || null;
    const message = body.message || null;

    const result = await requestAccountDeletion(req.user.id, {
      reasonCode,
      reasonLabel,
      message,
    });

    res.json({
      ok: true,
      accessUntil: result.accessUntil,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

async function reactivate(req, res, next) {
  try {
    const {
      reactivateAccount,
    } = require('../services/account_deletion.service');
    const user = await reactivateAccount(req.user.id);
    res.json({ ok: true, user });
  } catch (err) {
    next(err);
  }
}

async function streak(req, res, next) {
  try {
    const { getStreakForUser } = require('../services/streak.service');
    const streakData = await getStreakForUser(req.user.id);
    res.json({ ok: true, ...streakData });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  guest,
  google,
  apple,
  me,
  streak,
  refresh,
  updateMe,
  updateOnboarding,
  savePersonalization,
  updateNotifications,
  uploadAvatar,
  logout,
  retentionOffer,
  deleteAccount,
  reactivate,
};
