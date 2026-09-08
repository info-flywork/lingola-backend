'use strict';

const { pool } = require('../config/db');
const {
  setSubscriptionStatus,
  setSubscriptionState,
  syncUserSubscriptionFromRevenueCat,
} = require('./revenuecat_sync.service');
const {
  findPlanByProductId,
  inferPeriodFromProductId,
} = require('./subscription_plans.service');

/**
 * RevenueCat webhook → users.subscription_*.
 *
 * Plan politikası: aylık + 3 aylık (quarterly) ürünlerde ücretsiz deneme YOK.
 * Trial/intro Store'da kapalı olmalı. Eski sandbox TRIAL event'i gelse bile
 * erişim premium yazılır; ürün kataloğu trialDays=0 döner.
 *
 * TRANSFER: transferred_to → sync/premium, transferred_from → free.
 */

const ACTIVATE = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

const DEACTIVATE = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

function isMappableUserId(id) {
  const s = String(id || '').trim();
  return Boolean(s) && !s.startsWith('$RCAnonymousID');
}

function uniqueIds(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function productIdFromEvent(event) {
  const raw =
    event.product_id ||
    event.new_product_id ||
    event.product_identifier ||
    '';
  const id = String(raw).trim();
  return id || null;
}

async function applyTransfer(event) {
  const fromIds = uniqueIds(
    Array.isArray(event.transferred_from) ? event.transferred_from : [],
  ).filter(isMappableUserId);
  const toIds = uniqueIds(
    Array.isArray(event.transferred_to) ? event.transferred_to : [],
  ).filter(isMappableUserId);

  const results = { from: [], to: [] };

  for (const userId of fromIds) {
    const [users] = await pool.query(
      'SELECT id FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!users.length) continue;
    const rows = await setSubscriptionStatus(userId, 'free');
    console.log(
      `[RC-WEBHOOK] TRANSFER from → user=${userId} free (rows=${rows})`,
    );
    results.from.push({ userId, isPremium: false });
  }

  for (const userId of toIds) {
    const [users] = await pool.query(
      'SELECT id FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!users.length) {
      console.warn(
        `[RC-WEBHOOK] TRANSFER to user bulunamadı id=${userId}`,
      );
      continue;
    }
    const synced = await syncUserSubscriptionFromRevenueCat(userId);
    if (synced.ok) {
      results.to.push({
        userId,
        isPremium: Boolean(synced.isPremium),
        productId: synced.productId || null,
        via: 'rc_rest',
      });
      continue;
    }
    const rows = await setSubscriptionStatus(userId, 'premium');
    console.log(
      `[RC-WEBHOOK] TRANSFER to → user=${userId} premium fallback (rows=${rows}) reason=${synced.reason || '-'}`,
    );
    results.to.push({ userId, isPremium: true, via: 'fallback' });
  }

  return {
    handled: true,
    type: 'TRANSFER',
    noChange: results.from.length === 0 && results.to.length === 0,
    transfer: results,
  };
}

/**
 * @param {object} event RevenueCat `event` object
 */
async function applyRevenueCatEvent(event) {
  if (!event || typeof event !== 'object') {
    return { handled: false, reason: 'empty_event' };
  }

  const type = String(event.type || '').toUpperCase();

  if (type === 'TRANSFER') {
    return applyTransfer(event);
  }

  const appUserId = String(event.app_user_id || '').trim();

  if (!isMappableUserId(appUserId)) {
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
  const productId = productIdFromEvent(event);
  const plan = productId ? await findPlanByProductId(productId) : null;
  const planId = plan
    ? plan.id
    : inferPeriodFromProductId(productId);
  const periodType = String(event.period_type || '').toUpperCase();

  if (DEACTIVATE.has(type)) {
    const rows = await setSubscriptionState(appUserId, { status: 'free' });
    console.log(
      `[RC-WEBHOOK] ${type} → user=${appUserId} free (rows=${rows})`,
    );
    return { handled: true, type, userId: appUserId, isPremium: false };
  }

  if (ACTIVATE.has(type)) {
    const stillActive = !expiry || expiry.getTime() > Date.now();
    const status = stillActive ? 'premium' : 'free';
    const rows = await setSubscriptionState(appUserId, {
      status,
      productId: stillActive ? productId : null,
      planId: stillActive ? planId : null,
      expiresAt: stillActive ? expiry : null,
    });
    console.log(
      `[RC-WEBHOOK] ${type} → user=${appUserId} ${status}` +
        ` plan=${planId || '-'} product=${productId || '-'}` +
        ` period_type=${periodType || '-'} expiry=${expiry ? expiry.toISOString() : '-'}` +
        ` rows=${rows}`,
    );
    return {
      handled: true,
      type,
      userId: appUserId,
      isPremium: status === 'premium',
      planId: stillActive ? planId : null,
      productId: stillActive ? productId : null,
      // Katalogda deneme yok; RC period_type sadece log/telemetry.
      storePeriodType: periodType || null,
    };
  }

  console.log(
    `[RC-WEBHOOK] ${type} user=${appUserId} bilgilendirme, status değişmedi`,
  );
  return { handled: true, type, userId: appUserId, noChange: true };
}

module.exports = { applyRevenueCatEvent };
