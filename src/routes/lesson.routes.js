'use strict';

const { Router } = require('express');
const lessonController = require('../controllers/lesson.controller');
const { requireAuth } = require('../middlewares/auth');

const router = Router();

router.get('/path', requireAuth, lessonController.getPath);
router.post('/:slug/start', requireAuth, lessonController.start);
router.post('/:slug/complete', requireAuth, lessonController.complete);
router.get('/:slug/notes', requireAuth, lessonController.getNotes);
router.delete('/:slug/notes', requireAuth, lessonController.deleteNotes);

module.exports = router;
