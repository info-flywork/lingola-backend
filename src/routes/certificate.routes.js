'use strict';

const { Router } = require('express');
const certificateController = require('../controllers/certificate.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/me', requireAuth, certificateController.listMine);
router.get('/verify/:token', certificateController.verifyPublic);

module.exports = router;
