'use strict';

/**
 * Genel HTTP request logu — pm2 logs'ta görünür.
 * Hassas body yazılmaz; method/path/status/süre (+ user id varsa).
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const path = req.originalUrl || req.url;

  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const userPart = req.user?.id ? ` user=${req.user.id}` : '';
    const authPart = req.headers.authorization ? ' auth=1' : ' auth=0';
    console.log(
      `[http] ${method} ${path} → ${status} ${ms}ms${authPart}${userPart}`,
    );
  });

  next();
}

module.exports = { requestLogger };
