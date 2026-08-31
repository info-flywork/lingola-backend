'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.post('/guest', authController.guest);
router.post('/google', authController.google);
router.post('/apple', authController.apple);
router.post('/refresh', authController.refresh);
router.get('/me', requireAuth, authController.me);
router.get('/me/streak', requireAuth, authController.streak);
router.patch('/me', requireAuth, authController.updateMe);
router.patch('/me/onboarding', requireAuth, authController.updateOnboarding);
router.patch('/me/notifications', requireAuth, authController.updateNotifications);
router.post('/me/avatar', requireAuth, authController.uploadAvatar);
router.post('/retention-offer', requireAuth, authController.retentionOffer);
router.post('/delete-account', requireAuth, authController.deleteAccount);
router.post('/reactivate', requireAuth, authController.reactivate);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
