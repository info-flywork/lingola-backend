'use strict';

const { pool } = require('../config/db');

/**
 * RevenueCat product_id → subscription_plans satırı.
 * Aylık / 3 aylık: trial_days = 0 (ücretsiz deneme yok).
 */

async function listActiveSubscriptionPlans() {
  const [rows] = await pool.query(
    `SELECT id, rc_product_id, period, display_name, price_usd, trial_days,
            is_active, sort_order, notes
     FROM subscription_plans
     WHERE is_active = 1
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapPlanRow);
}

async function findPlanByProductId(productId) {
  const id = String(productId || '').trim();
  if (!id) return null;
  const [rows] = await pool.query(
    `SELECT id, rc_product_id, period, display_name, price_usd, trial_days,
            is_active, sort_order, notes
     FROM subscription_plans
     WHERE rc_product_id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] ? mapPlanRow(rows[0]) : null;
}

function mapPlanRow(row) {
  return {
    id: row.id,
    rcProductId: row.rc_product_id,
    period: row.period,
    displayName: row.display_name,
    priceUsd: row.price_usd == null ? null : Number(row.price_usd),
    trialDays: Number(row.trial_days) || 0,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    notes: row.notes || null,
  };
}

/**
 * product_id / entitlement product_identifier'dan period tahmini
 * (plan tablosu eşleşmezse).
 */
function inferPeriodFromProductId(productId) {
  const p = String(productId || '').toLowerCase();
  if (!p) return null;
  if (p.includes('quarter') || p.includes('3month') || p.includes('3_month')) {
    return 'quarterly';
  }
  if (p.includes('year') || p.includes('annual')) return 'yearly';
  if (p.includes('month')) return 'monthly';
  return null;
}

module.exports = {
  listActiveSubscriptionPlans,
  findPlanByProductId,
  inferPeriodFromProductId,
  mapPlanRow,
};
