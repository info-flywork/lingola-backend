'use strict';

function inspectRiveBuffer(buf) {
  const head = Buffer.isBuffer(buf) ? buf.subarray(0, 4) : Buffer.from(buf).subarray(0, 4);
  return {
    magic: head.toString('hex'),
    magicOk: head.length >= 4 && head.toString('latin1') === 'RIVE',
  };
}

async function probeRiveUrl(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-3' },
    });
    const ms = Date.now() - t0;
    const status = r.status;
    const contentLength =
      r.headers.get('content-length') || r.headers.get('Content-Length');
    const contentType = r.headers.get('content-type') || '-';

    let magic = '-';
    let magicOk = false;
    let bodyBytes = 0;
    if (r.ok || status === 206) {
      const buf = Buffer.from(await r.arrayBuffer());
      bodyBytes = buf.length;
      const inspected = inspectRiveBuffer(buf);
      magic = inspected.magic;
      magicOk = inspected.magicOk;
    }

    return {
      reachable: (r.ok || status === 206) && magicOk,
      status,
      ms,
      contentLength,
      contentType,
      magic,
      magicOk,
      bodyBytes,
    };
  } catch (err) {
    return {
      reachable: false,
      status: 0,
      ms: Date.now() - t0,
      magic: '-',
      magicOk: false,
      error: err?.message || String(err),
    };
  }
}

module.exports = { inspectRiveBuffer, probeRiveUrl };
