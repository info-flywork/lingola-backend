'use strict';

const { Router } = require('express');
const { env } = require('../config/env');
const {
  applyRevenueCatEvent,
} = require('../services/revenuecat_webhook.service');

const router = Router();

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

module.exports = router;
