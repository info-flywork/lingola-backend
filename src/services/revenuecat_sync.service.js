'use strict';

const { pool } = require('../config/db');
const { env } = require('../config/env');

const ENTITLEMENT_ID = 'premium';

/**
 * RevenueCat REST: GET /v1/subscribers/:appUserId
 * Secret key ile abonelik durumunu doğrula → users.subscription_status.
 */
async function fetchSubscriber(appUserId) {
  const secret = String(env.revenueCat.secretKey || '').trim();
  if (!secret) {
    return { ok: false, reason: 'missing_secret_key' };
  }

  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(
      `[RC-SYNC] subscriber fetch failed user=${appUserId} status=${res.status} ${body.slice(0, 200)}`,
    );
    return { ok: false, reason: 'rc_http_error', status: res.status };
  }

  const json = await res.json();
  return { ok: true, subscriber: json.subscriber || json };
}

function isEntitlementActive(entitlement) {
  if (!entitlement || typeof entitlement !== 'object') return false;
  const expires = entitlement.expires_date || entitlement.expires_date_ms;
  if (!expires) return true; // lifetime / null expiry
  const ms =
    typeof expires === 'number'
      ? expires
      : Date.parse(String(expires));
  if (!Number.isFinite(ms)) return true;
  return ms > Date.now();
}

function subscriberHasPremium(subscriber) {
  const ents = (subscriber && subscriber.entitlements) || {};
  const named = ents[ENTITLEMENT_ID];
  if (named && isEntitlementActive(named)) return true;
  // Yalnızca "premium" entitlement — rastgele aktif entitlement premium sayılmaz.
  return false;
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
 * App User ID (UUID) için RC → DB senkronu.
 * @returns {{ ok: boolean, isPremium?: boolean, reason?: string }}
 */
async function syncUserSubscriptionFromRevenueCat(userId) {
  const id = String(userId || '').trim();
  if (!id || id.startsWith('$RCAnonymousID')) {
    return { ok: false, reason: 'invalid_user_id' };
  }

  const fetched = await fetchSubscriber(id);
  if (!fetched.ok) return fetched;

  const isPremium = subscriberHasPremium(fetched.subscriber);
  const status = isPremium ? 'premium' : 'free';
  const rows = await setSubscriptionStatus(id, status);
  console.log(
    `[RC-SYNC] user=${id} → ${status} (rows=${rows})`,
  );
  return { ok: true, isPremium, status, rows };
}

module.exports = {
  syncUserSubscriptionFromRevenueCat,
  subscriberHasPremium,
  fetchSubscriber,
  setSubscriptionStatus,
};
