'use strict';

const { Router } = require('express');
const quizController = require('../controllers/quiz.controller');
const speakingQuizController = require('../controllers/speaking_quiz.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/reading/words', requireAuth, quizController.getReadingWords);
router.get('/writing/words', requireAuth, quizController.getWritingWords);
router.post(
  '/writing/evaluate-text',
  requireAuth,
  quizController.evaluateWritingAnswer,
);
router.post(
  '/writing/evaluate-audio',
  requireAuth,
  quizController.evaluateWritingRecording,
);
router.get(
  '/speaking/prompts',
  requireAuth,
  speakingQuizController.getSpeakingPrompts,
);
router.post(
  '/speaking/evaluate',
  requireAuth,
  speakingQuizController.evaluateSpeaking,
);

module.exports = router;
