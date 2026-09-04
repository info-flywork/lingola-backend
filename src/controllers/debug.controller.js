'use strict';

const { listActiveTutors } = require('../services/tutor.service');
const { probeRiveUrl } = require('../utils/rive-probe');

/**
 * GET /debug/rive-check
 *
 * Her tutor'un `rive_cdn_url` alanını Bunny CDN üzerinden prob eder:
 *  - Range: bytes=0-3 ile sadece ilk 4 byte çekilir (magic doğrulama yeterli).
 *  - HTTP status, süre, content-type, content-length loglanır.
 *  - Rive dosyalarının başında `RIVE` (0x52 0x49 0x56 0x45) magic olur;
 *    yoksa dosya bozuk / eksik / yanlış tip.
 *
 * Terminal'den:  curl -s https://<api-host>/debug/rive-check | jq
 *
 * TestFlight'ta rive gelmiyor -> önce bunu çağır. fail=0 ise sorun client
 * tarafında (network/rive_native), fail>0 ise sorun CDN veya seed işinde.
 */
async function checkRiveCdn(_req, res, next) {
  try {
    const tutors = await listActiveTutors();
    const results = [];

    for (const t of tutors) {
      const url = t.riveCdnUrl;
      if (!url) {
        results.push({ slug: t.slug, url: null, ok: false, reason: 'no-url' });
        console.warn(`[rive-check] ${t.slug} URL YOK (rive_cdn_url null)`);
        continue;
      }
      try {
        const probe = await probeRiveUrl(url);
        results.push({
          slug: t.slug,
          url,
          ok: probe.reachable,
          status: probe.status,
          ms: probe.ms,
          contentLength: probe.contentLength,
          contentType: probe.contentType,
          magic: probe.magic,
          magicOk: probe.magicOk,
          bodyBytes: probe.bodyBytes,
          error: probe.error,
        });
        console.log(
          `[rive-check] ${t.slug} status=${probe.status} ms=${probe.ms} ct=${probe.contentType} magic=${probe.magic} ok=${probe.reachable} url=${url}`,
        );
      } catch (err) {
        results.push({
          slug: t.slug,
          url,
          ok: false,
          reason: 'fetch-error',
          error: err?.message || String(err),
        });
        console.error(
          `[rive-check] ${t.slug} FETCH FAILED: ${err?.message || err} url=${url}`,
        );
      }
    }

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      noUrl: results.filter((r) => r.reason === 'no-url').length,
    };
    console.log(
      `[rive-check] SUMMARY total=${summary.total} ok=${summary.ok} fail=${summary.fail} noUrl=${summary.noUrl}`,
    );
    res.json({ ok: true, summary, results });
  } catch (err) {
    console.error('[rive-check] handler error:', err?.message || err);
    next(err);
  }
}

module.exports = { checkRiveCdn };
