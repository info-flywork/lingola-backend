'use strict';

const { listActiveTutors } = require('../services/tutor.service');

async function listTutors(_req, res, next) {
  try {
    const tutors = await listActiveTutors();
    res.json({ ok: true, tutors });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTutors };
