'use strict';

const { Router } = require('express');
const tutorChatController = require('../controllers/tutor_chat.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.post('/sessions', requireAuth, tutorChatController.openSession);
router.get('/sessions', requireAuth, tutorChatController.listSessions);
router.get(
  '/sessions/:sessionId/messages',
  requireAuth,
  tutorChatController.getMessages,
);
router.post(
  '/sessions/:sessionId/messages',
  requireAuth,
  tutorChatController.postMessage,
);

module.exports = router;
