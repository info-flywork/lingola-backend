'use strict';

/**
 * Tüm HTTP istekleri için bol log (pm2 logs).
 * Şifre / token / base64 audio yazılmaz — sadece özet.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'apikey',
  'secret',
  'idToken',
  'firebaseToken',
  'audioBase64',
  'audio_base64',
  'fileBase64',
]);

function redactValue(key, value) {
  const k = String(key || '').toLowerCase();
  if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(k)) {
    if (typeof value === 'string') {
      return `<redacted len=${value.length}>`;
    }
    return '<redacted>';
  }
  if (typeof value === 'string' && value.length > 240) {
    // Muhtemel base64 / uzun metin
    if (/^[A-Za-z0-9+/=]+$/.test(value.slice(0, 80)) && value.length > 400) {
      return `<base64? len=${value.length}>`;
    }
    return `${value.slice(0, 120)}…<len=${value.length}>`;
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (value && typeof value === 'object') {
    return summarizeBody(value, 1);
  }
  return value;
}

function summarizeBody(body, depth = 0) {
  if (body == null) return null;
  if (typeof body !== 'object') return body;
  if (depth > 2) return '<nested>';

  const out = {};
  const keys = Object.keys(body);
  for (const key of keys.slice(0, 40)) {
    out[key] = redactValue(key, body[key]);
  }
  if (keys.length > 40) out._truncated = `+${keys.length - 40} keys`;
  return out;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '?';
}

function requestLogger(req, res, next) {
  const start = Date.now();
  const method = req.method;
  const path = req.originalUrl || req.url;
  const ip = clientIp(req);
  const auth = req.headers.authorization ? 1 : 0;
  const ua = String(req.headers['user-agent'] || '').slice(0, 80);

  const queryKeys = Object.keys(req.query || {});
  const bodySummary = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ? summarizeBody(req.body)
    : null;

  console.log(
    `[http:in] ${method} ${path} ip=${ip} auth=${auth} ua="${ua}"` +
      (queryKeys.length ? ` query=${JSON.stringify(req.query)}` : '') +
      (bodySummary ? ` body=${JSON.stringify(bodySummary)}` : ''),
  );

  // Response özeti — res.json sarmalayıcı
  const originalJson = res.json.bind(res);
  res.json = function loggedJson(payload) {
    try {
      if (payload && typeof payload === 'object') {
        const bits = [];
        if (payload.ok != null) bits.push(`ok=${payload.ok}`);
        if (Array.isArray(payload.tutors)) {
          bits.push(`tutors=${payload.tutors.length}`);
        }
        if (Array.isArray(payload.visemes)) {
          bits.push(`visemes=${payload.visemes.length}`);
        }
        if (typeof payload.audioBase64 === 'string') {
          bits.push(`audioBase64.len=${payload.audioBase64.length}`);
        }
        if (typeof payload.text === 'string') {
          bits.push(`text.len=${payload.text.length}`);
        }
        if (payload.error) bits.push(`error=${String(payload.error).slice(0, 120)}`);
        if (bits.length) {
          res.locals._responseSummary = bits.join(' ');
        }
      }
    } catch (_) {
      /* ignore */
    }
    return originalJson(payload);
  };

  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const userPart = req.user?.id ? ` user=${req.user.id}` : '';
    const len = res.getHeader('content-length');
    const lenPart = len != null ? ` bytes=${len}` : '';
    const summary = res.locals._responseSummary
      ? ` ${res.locals._responseSummary}`
      : '';
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';
    const line =
      `[http:out] ${method} ${path} → ${status} ${ms}ms auth=${auth}${userPart}${lenPart}${summary}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  });

  next();
}

module.exports = { requestLogger, summarizeBody };
