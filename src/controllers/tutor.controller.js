'use strict';

const {
  listActiveTutors,
  findActiveTutorBySlug,
} = require('../services/tutor.service');
const { probeRiveUrl } = require('../utils/rive-probe');

async function listTutors(_req, res, next) {
  try {
    const tutors = await listActiveTutors();
    const withLocalRiv = tutors.filter((t) => t.localRivePath).length;
    const withCdnRiv = tutors.filter((t) => t.riveCdnUrl).length;
    console.log(
      `[tutors] list count=${tutors.length} localRive=${withLocalRiv} cdnRive=${withCdnRiv}`,
    );
    for (const t of tutors.slice(0, 8)) {
      console.log(
        `[tutors] ${t.slug} local=${t.localRivePath || '-'} cdn=${t.riveCdnUrl || '-'} voice=${t.voiceId || '-'}`,
      );
    }
    if (tutors.length > 8) {
      console.log(`[tutors] … +${tutors.length - 8} more`);
    }
    res.json({ ok: true, tutors });
  } catch (err) {
    console.error('[tutors] list fail:', err?.message || err);
    next(err);
  }
}

/**
 * Görüntülü konuşma ekranı açılınca client bunu çağırır.
 * DB'deki rive_cdn_url + CDN erişilebilirliği loglanır (pm2 logs).
 *
 * GET /tutors/:slug/call-enter
 */
async function callEnter(req, res, next) {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  const clientRive = String(req.query.riveUrl || req.query.cdn || '').trim();
  try {
    console.log(
      `[call-enter] START slug=${slug || '-'} clientRive=${clientRive || '-'} ua="${req.get('user-agent') || '-'}"`,
    );

    if (!slug) {
      console.warn('[call-enter] slug boş');
      return res.status(400).json({ ok: false, error: 'slug required' });
    }

    const tutor = await findActiveTutorBySlug(slug);
    if (!tutor) {
      console.warn(`[call-enter] tutor YOK slug=${slug}`);
      return res.status(404).json({ ok: false, error: 'tutor not found', slug });
    }

    const url = (tutor.riveCdnUrl || clientRive || '').trim();
    console.log(
      `[call-enter] DB slug=${tutor.slug} id=${tutor.id}` +
        ` riveCdn=${tutor.riveCdnUrl || '-'}` +
        ` localRive=${tutor.localRivePath || '-'}` +
        ` voice=${tutor.voiceId || '-'}`,
    );

    if (!url) {
      console.error(`[call-enter] ❌ rive URL YOK slug=${slug}`);
      return res.json({
        ok: false,
        slug,
        tutor,
        rive: { url: null, reachable: false, reason: 'no-url' },
      });
    }

    const probe = await probeRiveUrl(url);
    const tag = probe.reachable ? '✅' : '❌';
    console.log(
      `[call-enter] ${tag} CDN slug=${slug}` +
        ` status=${probe.status} ms=${probe.ms}` +
        ` magic=${probe.magic} reachable=${probe.reachable}` +
        ` len=${probe.contentLength || '-'}` +
        ` url=${url}`,
    );
    if (probe.error) {
      console.error(`[call-enter] CDN error slug=${slug}: ${probe.error}`);
    }

    res.json({
      ok: probe.reachable,
      slug: tutor.slug,
      tutor: {
        id: tutor.id,
        slug: tutor.slug,
        riveCdnUrl: tutor.riveCdnUrl,
        localRivePath: tutor.localRivePath,
        voiceId: tutor.voiceId,
      },
      rive: { url, ...probe },
    });
  } catch (err) {
    console.error(`[call-enter] fail slug=${slug}:`, err?.message || err);
    next(err);
  }
}

module.exports = { listTutors, callEnter };
