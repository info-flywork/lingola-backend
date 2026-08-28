'use strict';

const certificates = require('../services/certificate.service');

async function listMine(req, res, next) {
  try {
    const payload = await certificates.getCertificatesForUser(req.user);
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function verifyPublic(req, res, next) {
  try {
    const cert = await certificates.findByVerifyToken(req.params.token);
    if (!cert) {
      const err = new Error('Certificate not found');
      err.status = 404;
      throw err;
    }

    const wantsJson =
      req.query.format === 'json' ||
      (req.headers.accept || '').includes('application/json');

    if (wantsJson) {
      res.json({ ok: true, certificate: cert });
      return;
    }

    res.type('html').send(certificates.buildVerifyHtml(cert));
  } catch (err) {
    next(err);
  }
}

module.exports = { listMine, verifyPublic };
