'use strict';

const { Router } = require('express');
const { env } = require('../config/env');
const { requireAuth } = require('../middlewares/auth');
const {
  applyRevenueCatEvent,
} = require('../services/revenuecat_webhook.service');
const {
  syncUserSubscriptionFromRevenueCat,
} = require('../services/revenuecat_sync.service');
const {
  listActiveSubscriptionPlans,
} = require('../services/subscription_plans.service');
const { mapUserRow } = require('../utils/auth');
const { pool } = require('../config/db');

const router = Router();

/**
 * GET /billing/plans
 * Aktif abonelik paketleri (aylık + 3 aylık; trialDays her zaman 0).
 */
router.get('/plans', async (_req, res) => {
  try {
    const plans = await listActiveSubscriptionPlans();
    return res.status(200).json({
      ok: true,
      plans,
      policy: {
        freeTrialDays: 0,
        note: 'Monthly and quarterly plans have no free trial',
      },
    });
  } catch (err) {
    console.error('[BILLING] plans error', err);
    return res.status(500).json({ ok: false, error: 'Failed to list plans' });
  }
});

/**
 * POST /billing/revenuecat-webhook
 * RevenueCat Dashboard → Integrations → Webhooks
 * URL: https://lingola.fly-work.com/billing/revenuecat-webhook
 * Authorization header: REVENUECAT_WEBHOOK_AUTH değeri (Bearer ... veya ham token)
 */
router.post('/revenuecat-webhook', async (req, res) => {
  try {
    const expected = String(env.revenueCat.webhookAuth || '').trim();
    if (expected) {
      const provided = String(req.headers.authorization || '').trim();
      if (provided !== expected && provided !== `Bearer ${expected}`) {
        console.warn('[RC-WEBHOOK] Authorization reddedildi');
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }

    const event = req.body && req.body.event ? req.body.event : req.body;
    const result = await applyRevenueCatEvent(event);
    // RC 2xx dışı yanıtlarda retry eder; eşleşmeyen user için de 200.
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[RC-WEBHOOK] error', err);
    return res.status(500).json({ ok: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /billing/sync
 * Client: Purchases.logIn sonrası DB'yi RC ile hizala (anonim satın alma / TRANSFER gecikmesi).
 */
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const synced = await syncUserSubscriptionFromRevenueCat(userId);
    if (!synced.ok && synced.reason === 'missing_secret_key') {
      const [rows] = await pool.query(
        'SELECT * FROM users WHERE id = ? LIMIT 1',
        [userId],
      );
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: synced.reason,
        user: rows[0] ? mapUserRow(rows[0]) : null,
      });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [userId],
    );
    return res.status(200).json({
      ok: true,
      isPremium: Boolean(synced.isPremium),
      productId: synced.productId || null,
      user: rows[0] ? mapUserRow(rows[0]) : null,
    });
  } catch (err) {
    console.error('[RC-SYNC] error', err);
    return res.status(500).json({ ok: false, error: 'Sync failed' });
  }
});

module.exports = router;
