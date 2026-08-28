'use strict';

const { Router } = require('express');
const notificationsController = require('../controllers/notifications.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/', requireAuth, notificationsController.listNotifications);
router.patch('/:id/read', requireAuth, notificationsController.markNotificationRead);
router.delete('/:id', requireAuth, notificationsController.dismissNotification);
router.post('/read-all', requireAuth, notificationsController.markAllNotificationsRead);

module.exports = router;
