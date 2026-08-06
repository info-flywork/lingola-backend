'use strict';

const { Router } = require('express');
const practiceController = require('../controllers/practice.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/words', requireAuth, practiceController.getCards);
router.get('/saved-words', requireAuth, practiceController.listSaved);
router.get('/saved-words/count', requireAuth, practiceController.savedCount);
router.post('/words/:wordId/save', requireAuth, practiceController.saveWord);
router.delete('/words/:wordId/save', requireAuth, practiceController.unsaveWord);

module.exports = router;
