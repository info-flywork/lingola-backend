'use strict';

const { Router } = require('express');
const tutorController = require('../controllers/tutor.controller');

const router = Router();

router.get('/', tutorController.listTutors);

module.exports = router;
