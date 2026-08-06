'use strict';

const { findUserBySessionToken } = require('../services/auth.service');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    const user = await findUserBySessionToken(match[1].trim());
    if (!user) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    req.user = user;
    req.accessToken = match[1].trim();
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
