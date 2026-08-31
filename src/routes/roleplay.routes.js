'use strict';

const { Router } = require('express');
const roleplayController = require('../controllers/roleplay.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/scenarios', requireAuth, roleplayController.listScenarios);
router.post(
  '/scenarios/:scenarioId/progress',
  requireAuth,
  roleplayController.saveProgress,
);

module.exports = router;
