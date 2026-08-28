'use strict';

const notifications = require('../services/notifications.service');

async function listNotifications(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50);
    const payload = await notifications.listForUser(req.user.id, { limit });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function recordNotification(req, res, next) {
  try {
    const created = await notifications.record(req.user.id, req.body || {});
    if (!created) {
      const err = new Error('Invalid notification payload');
      err.status = 400;
      throw err;
    }
    res.status(201).json({ ok: true, notification: created });
  } catch (err) {
    next(err);
  }
}

async function syncNotifications(req, res, next) {
  try {
    const items = req.body?.notifications;
    const result = await notifications.syncBatch(req.user.id, items);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      const err = new Error('Notification id is required');
      err.status = 400;
      throw err;
    }
    await notifications.markRead(req.user.id, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await notifications.markAllRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function dismissNotification(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      const err = new Error('Notification id is required');
      err.status = 400;
      throw err;
    }
    await notifications.dismiss(req.user.id, id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  recordNotification,
  syncNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
};
