'use strict';

const { listActiveTutors } = require('../services/tutor.service');

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
        `[tutors] ${t.slug} local=${t.localRivePath || '-'} cdn=${t.riveCdnUrl ? 'yes' : 'no'} voice=${t.voiceId || '-'}`,
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

module.exports = { listTutors };
