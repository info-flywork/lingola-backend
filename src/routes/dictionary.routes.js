'use strict';

const { Router } = require('express');
const dictionaryController = require('../controllers/dictionary.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/words', requireAuth, dictionaryController.listWords);
router.get('/search', requireAuth, dictionaryController.searchWords);

module.exports = router;
