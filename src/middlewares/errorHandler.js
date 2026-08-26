'use strict';

function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: 'Not Found',
    path: req.originalUrl,
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status || err.statusCode || 500;
  const method = req.method;
  const path = req.originalUrl || req.url;
  console.error(
    `[error] ${method} ${path} status=${status} msg=${err.message || err}`,
  );
  if (err.stack) {
    console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  }

  const payload = {
    ok: false,
    error: err.message || 'Internal Server Error',
  };

  if (process.env.NODE_ENV !== 'production' && err.code) {
    payload.code = err.code;
  }

  res.status(status).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
