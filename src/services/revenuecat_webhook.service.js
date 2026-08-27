'use strict';

const { pool } = require('../config/db');

/**
 * RevenueCat webhook → users.subscription_status.
 * Trial (period_type=TRIAL / INTRO) de premium sayılır (3 gün ücretsiz).
 */

const ACTIVATE = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

const DEACTIVATE = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

function isTrialPeriod(periodType) {
  const t = String(periodType || '').toUpperCase();
  return t === 'TRIAL' || t === 'INTRO';
}

async function setSubscriptionStatus(userId, status) {
  const [result] = await pool.query(
    `UPDATE users
     SET subscription_status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, userId],
  );
  return result.affectedRows || 0;
}

/**
 * @param {object} event RevenueCat `event` object
 */
async function applyRevenueCatEvent(event) {
  if (!event || typeof event !== 'object') {
    return { handled: false, reason: 'empty_event' };
  }

  const type = String(event.type || '').toUpperCase();
  const appUserId = String(event.app_user_id || '').trim();

  // Flutter Purchases.logIn(user.id) → UUID. Anonim RC id eşlenmez.
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) {
    console.warn(
      `[RC-WEBHOOK] Eşlenemeyen app_user_id='${appUserId}' (type=${type})`,
    );
    return { handled: false, reason: 'unmapped_app_user_id', type };
  }

  const [users] = await pool.query(
    'SELECT id, subscription_status FROM users WHERE id = ? LIMIT 1',
    [appUserId],
  );
  if (!users.length) {
    console.warn(`[RC-WEBHOOK] user bulunamadı id=${appUserId} type=${type}`);
    return { handled: false, reason: 'user_not_found', type, appUserId };
  }

  const expiryMs = event.expiration_at_ms
    ? Number(event.expiration_at_ms)
    : null;
  const expiry = expiryMs && Number.isFinite(expiryMs) ? new Date(expiryMs) : null;
  const trial = isTrialPeriod(event.period_type);

  if (DEACTIVATE.has(type)) {
    const rows = await setSubscriptionStatus(appUserId, 'free');
    console.log(
      `[RC-WEBHOOK] ${type} → user=${appUserId} free (rows=${rows})`,
    );
    return { handled: true, type, userId: appUserId, isPremium: false };
  }

  if (ACTIVATE.has(type)) {
    const stillActive = !expiry || expiry.getTime() > Date.now();
    const status = stillActive ? 'premium' : 'free';
    const rows = await setSubscriptionStatus(appUserId, status);
    console.log(
      `[RC-WEBHOOK] ${type} → user=${appUserId} ${status}` +
        ` trial=${trial} expiry=${expiry ? expiry.toISOString() : '-'} rows=${rows}`,
    );
    return {
      handled: true,
      type,
      userId: appUserId,
      isPremium: status === 'premium',
      isTrial: trial,
    };
  }

  // CANCELLATION / BILLING_ISSUE / TEST → süre bitene kadar premium kalsın
  console.log(
    `[RC-WEBHOOK] ${type} user=${appUserId} bilgilendirme, status değişmedi`,
  );
  return { handled: true, type, userId: appUserId, noChange: true };
}

module.exports = { applyRevenueCatEvent };
