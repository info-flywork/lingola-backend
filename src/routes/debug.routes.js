'use strict';

const { Router } = require('express');
const { checkRiveCdn } = require('../controllers/debug.controller');

const router = Router();

router.get('/rive-check', checkRiveCdn);

module.exports = router;
