'use strict';

const { Router } = require('express');
const aiController = require('../controllers/ai.controller');

const router = Router();

router.post('/transcribe', aiController.transcribe);
router.post('/chat', aiController.chat);
router.post('/translate', aiController.translate);
router.post('/tts', aiController.tts);
router.post('/tts/lipsync', aiController.ttsLipsync);

module.exports = router;
