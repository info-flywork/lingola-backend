'use strict';

const { ping } = require('../config/db');

function getHealth(_req, res) {
  res.json({
    ok: true,
    service: 'lingola-backend',
    uptime: process.uptime(),
  });
}

async function getDbHealth(_req, res, next) {
  try {
    const result = await ping();
    res.json({
      ok: true,
      db: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHealth, getDbHealth };
