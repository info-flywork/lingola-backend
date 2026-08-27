'use strict';

const { Router } = require('express');
const tutorController = require('../controllers/tutor.controller');

const router = Router();

router.get('/', tutorController.listTutors);
// Görüntülü konuşma açılınca client çağırır → CDN .riv probe + pm2 log
router.get('/:slug/call-enter', tutorController.callEnter);

module.exports = router;
