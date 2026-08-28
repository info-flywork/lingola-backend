'use strict';

const {
  createGuestUser,
  updateUserProfile,
  updateUserAvatar,
  revokeSessionToken,
  loginWithProvider,
  refreshSessionToken,
} = require('../services/auth.service');
const {
  parseOnboarding,
  normalizeLocaleCode,
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

    const result = await createGuestUser({
      appLocale,
      notificationsEnabled: Boolean(notificationsEnabled),
      onboarding,
    });

    res.status(201).json({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
      user: result.user,
    });
    console.log(
      `[auth] guest ok user=${result.user?.id} locale=${appLocale}`,
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
  updateNotifications,
  uploadAvatar,
  logout,
  retentionOffer,
  deleteAccount,
  reactivate,
};
