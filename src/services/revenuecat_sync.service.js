'use strict';

const { pool } = require('../config/db');
const { env } = require('../config/env');
const {
  findPlanByProductId,
  inferPeriodFromProductId,
} = require('./subscription_plans.service');

const ENTITLEMENT_ID = 'premium';

/**
 * RevenueCat REST: GET /v1/subscribers/:appUserId
 * Secret key ile abonelik durumunu doğrula → users.subscription_*.
 *
 * Not: Aylık / 3 aylık ürünlerde ücretsiz deneme yok (trial_days=0).
 * Store tarafında intro/trial tanımlı olmamalı; backend TRIAL gelse bile
 * premium erişim verir ama plan kataloğu deneme vaat etmez.
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
  if (!expires) return true;
  const ms =
    typeof expires === 'number'
      ? expires
      : Date.parse(String(expires));
  if (!Number.isFinite(ms)) return true;
  return ms > Date.now();
}

function extractPremiumEntitlement(subscriber) {
  const ents = (subscriber && subscriber.entitlements) || {};
  const named = ents[ENTITLEMENT_ID];
  if (named && isEntitlementActive(named)) return named;
  return null;
}

function subscriberHasPremium(subscriber) {
  return Boolean(extractPremiumEntitlement(subscriber));
}

/**
 * @param {string} userId
 * @param {{
 *   status: 'free'|'premium'|'passive',
 *   productId?: string|null,
 *   planId?: string|null,
 *   expiresAt?: Date|null,
 * }} state
 */
async function setSubscriptionState(userId, state) {
  const status = state.status;
  let productId = state.productId != null ? String(state.productId).trim() : null;
  if (productId === '') productId = null;

  let planId = state.planId != null ? String(state.planId).trim() : null;
  if (planId === '') planId = null;

  if (!planId && productId) {
    const plan = await findPlanByProductId(productId);
    planId = plan ? plan.id : inferPeriodFromProductId(productId);
  }

  const expiresAt =
    state.expiresAt instanceof Date && !Number.isNaN(state.expiresAt.getTime())
      ? state.expiresAt
      : null;

  if (status === 'free') {
    const [result] = await pool.query(
      `UPDATE users
       SET subscription_status = 'free',
           subscription_plan_id = NULL,
           subscription_product_id = NULL,
           subscription_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId],
    );
    return result.affectedRows || 0;
  }

  const [result] = await pool.query(
    `UPDATE users
     SET subscription_status = ?,
         subscription_plan_id = ?,
         subscription_product_id = ?,
         subscription_expires_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, planId, productId, expiresAt, userId],
  );
  return result.affectedRows || 0;
}

/** Geriye dönük: yalnızca status. */
async function setSubscriptionStatus(userId, status) {
  if (status === 'free') {
    return setSubscriptionState(userId, { status: 'free' });
  }
  return setSubscriptionState(userId, { status });
}

/**
 * App User ID (UUID) için RC → DB senkronu.
 */
async function syncUserSubscriptionFromRevenueCat(userId) {
  const id = String(userId || '').trim();
  if (!id || id.startsWith('$RCAnonymousID')) {
    return { ok: false, reason: 'invalid_user_id' };
  }

  const fetched = await fetchSubscriber(id);
  if (!fetched.ok) return fetched;

  const ent = extractPremiumEntitlement(fetched.subscriber);
  const isPremium = Boolean(ent);
  const productId = ent
    ? ent.product_identifier || ent.product_id || null
    : null;
  let expiresAt = null;
  if (ent && ent.expires_date) {
    const ms = Date.parse(String(ent.expires_date));
    if (Number.isFinite(ms)) expiresAt = new Date(ms);
  }

  const status = isPremium ? 'premium' : 'free';
  const rows = await setSubscriptionState(id, {
    status,
    productId,
    expiresAt,
  });
  console.log(
    `[RC-SYNC] user=${id} → ${status} product=${productId || '-'} (rows=${rows})`,
  );
  return { ok: true, isPremium, status, productId, rows };
}

module.exports = {
  syncUserSubscriptionFromRevenueCat,
  subscriberHasPremium,
  fetchSubscriber,
  setSubscriptionStatus,
  setSubscriptionState,
  extractPremiumEntitlement,
};
