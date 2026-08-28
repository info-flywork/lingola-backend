'use strict';

const { API_ERROR_CODES, apiError } = require('../utils/api_error_codes');

const { findUserBySessionToken } = require('../services/auth.service');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      throw apiError('Unauthorized', {
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
      });
    }

    const user = await findUserBySessionToken(match[1].trim());
    if (!user) {
      throw apiError('Unauthorized', {
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
      });
    }

    req.user = user;
    req.accessToken = match[1].trim();
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth };
