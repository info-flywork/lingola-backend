'use strict';

const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const tutorRoutes = require('./tutor.routes');
const practiceRoutes = require('./practice.routes');
const quizRoutes = require('./quiz.routes');
const dictionaryRoutes = require('./dictionary.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/tutors', tutorRoutes);
router.use('/practice', practiceRoutes);
router.use('/quiz', quizRoutes);
router.use('/dictionary', dictionaryRoutes);
router.use('/chat', require('./tutor_chat.routes'));
router.use('/lessons', require('./lesson.routes'));
router.use('/roleplay', require('./roleplay.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/ai', require('./ai.routes'));
router.use('/billing', require('./billing.routes'));
router.use('/certificates', require('./certificate.routes'));
router.use('/debug', require('./debug.routes'));

module.exports = router;
