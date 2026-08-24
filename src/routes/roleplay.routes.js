'use strict';

const { Router } = require('express');
const roleplayController = require('../controllers/roleplay.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/scenarios', requireAuth, roleplayController.listScenarios);

module.exports = router;
