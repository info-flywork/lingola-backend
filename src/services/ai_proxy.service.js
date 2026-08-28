'use strict';

const { env } = require('../config/env');

function stripDataUrl(base64) {
  const raw = String(base64 || '');
  const idx = raw.indexOf('base64,');
  return idx >= 0 ? raw.slice(idx + 7) : raw;
}

function requireOpenAi() {
  const apiKey = env.openai.apiKey;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  return apiKey;
}

function resolveVoiceId(voiceId) {
  const id = String(voiceId || env.elevenlabs.voiceId || '').trim();
  if (!id) {
    const err = new Error('voiceId is required');
    err.status = 400;
    throw err;
  }
  return id;
}

async function transcribeAudio({ audioBase64, contentType = 'audio/m4a' }) {
  const apiKey = requireOpenAi();

  const buffer = Buffer.from(stripDataUrl(audioBase64), 'base64');
  if (!buffer.length) {
    const err = new Error('Empty audio payload');
    err.status = 400;
    throw err;
  }

  const ext = contentType.includes('wav')
    ? 'wav'
    : contentType.includes('mpeg') || contentType.includes('mp3')
      ? 'mp3'
      : contentType.includes('webm')
        ? 'webm'
        : 'm4a';

  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: contentType || 'audio/m4a' }),
    `speech.${ext}`,
  );
  form.append('model', 'whisper-1');
  form.append('language', 'en');
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Whisper ${res.status}: ${text.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const json = await res.json();
  return String(json.text || '').trim();
}

async function chatComplete({
  messages,
  temperature = 0.7,
  maxTokens = 120,
}) {
  const apiKey = requireOpenAi();
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('messages is required');
    err.status = 400;
    throw err;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.openai.model || 'gpt-4o-mini',
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${text.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  const text = String(content || '').trim();
  if (!text) {
    const err = new Error('OpenAI returned empty reply');
    err.status = 502;
    throw err;
  }
  return text;
}

const TRANSLATE_LANG_LABELS = {
  en: 'English',
  de: 'German',
  it: 'Italian',
  fr: 'French',
  tr: 'Turkish',
  ja: 'Japanese',
  es: 'Spanish',
  ru: 'Russian',
  hi: 'Hindi',
  pt: 'Portuguese',
  zh: 'Chinese (Simplified)',
};

async function translateToLanguage(text, targetLang = 'tr') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const { normalizeLangCode } = require('../utils/locale');
  const code = normalizeLangCode(targetLang, 'tr');
  const langName = TRANSLATE_LANG_LABELS[code] || TRANSLATE_LANG_LABELS.tr;

  return chatComplete({
    messages: [
      {
        role: 'system',
        content:
          `You translate English to ${langName} for language learners. `
          + `Reply with only the ${langName} translation, nothing else. `
          + 'Keep it natural and concise.',
      },
      { role: 'user', content: trimmed },
    ],
    temperature: 0.2,
    maxTokens: 200,
  });
}

async function translateToTurkish(text) {
  return translateToLanguage(text, 'tr');
}

async function openAiTts(text, { voiceId } = {}) {
  const apiKey = requireOpenAi();
  const maleIds = new Set([
    'sJ8GED3d0sN1d0bmD6mH',
    'PIGsltMj3gFMR34aFDI3',
    'uDsPstFWFBUXjIBimV7s',
    'wXvR48IpOq9HACltTmt7',
    'TsHrPyMlNFuIYnbODF01',
  ]);
  const resolved = resolveVoiceId(voiceId);
  const openAiVoice = maleIds.has(resolved) ? 'onyx' : 'nova';
  console.warn(`[tts] OpenAI fallback voice=${openAiVoice} for eleven=${resolved}`);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: openAiVoice,
      input: String(text || '').trim(),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenAI TTS ${res.status}: ${body.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}

async function elevenLabsTts({ text, voiceId, modelId }) {
  const apiKey = env.elevenlabs.apiKey;
  if (!apiKey) {
    const err = new Error('ELEVENLABS_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const id = resolveVoiceId(voiceId);
  console.log(`[tts] elevenLabs voice=${id} model=${modelId || 'default'} len=${String(text || '').trim().length}`);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: String(text || '').trim(),
        model_id: modelId || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8 },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ElevenLabs ${res.status}: ${body.slice(0, 240)}`);
    err.status = 502;
    throw err;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}

/** Aynı ağız şekli min tutma — harf-harf titreme olmasın. */
const MIN_VISEME_HOLD_SEC = 0.14;
/** Kelime arası sessizlik — ağız kapalı kalsın. */
const MIN_SILENCE_HOLD_SEC = 0.07;

function coalesceVisemes(cues, minHoldSec = MIN_VISEME_HOLD_SEC) {
  if (!cues.length) return [];
  const out = [];
  let cur = { ...cues[0] };
  for (let i = 1; i < cues.length; i += 1) {
    const next = cues[i];
    if (next.v === 0 && next.e - next.s >= MIN_SILENCE_HOLD_SEC) {
      if (cur.v !== 0) {
        out.push({ s: cur.s, e: Math.min(cur.e, next.s), v: cur.v });
      } else {
        out.push(cur);
      }
      cur = { ...next };
      continue;
    }
    if (cur.v === 0) {
      out.push(cur);
      cur = { ...next };
      continue;
    }
    const hold = cur.e - cur.s;
    const same = next.v === cur.v;
    const tooSoon = next.s - cur.s < minHoldSec;
    if (same || (tooSoon && next.v !== 0) || hold < minHoldSec) {
      cur = {
        s: cur.s,
        e: Math.max(cur.e, next.e),
        v: cur.v,
      };
    } else {
      out.push({
        s: cur.s,
        e: Math.max(cur.e, cur.s + minHoldSec),
        v: cur.v,
      });
      const start = Math.max(next.s, cur.s + minHoldSec);
      cur = {
        s: start,
        e: Math.max(next.e, start + minHoldSec * 0.5),
        v: next.v,
      };
    }
  }
  out.push(cur);
  return out;
}

/** Alignment yokken metinden yaklaşık viseme timeline (Rive: 0/2/6/10/14). */
function heuristicVisemesFromText(text, durationSec = null) {
  const chars = String(text || '')
    .split('')
    .filter((c) => c !== '\r');
  if (chars.length === 0) return [];

  const estimated =
    durationSec && durationSec > 0.2
      ? durationSec
      : Math.max(1.0, chars.length * 0.12);
  const step = estimated / chars.length;
  const cues = [];
  let pending = null;

  function flush() {
    if (pending) cues.push(pending);
    pending = null;
  }

  for (let i = 0; i < chars.length; i += 1) {
    const s = i * step;
    const e = (i + 1) * step;
    const v = visemeForChar(chars[i]);
    if (v === 0) {
      flush();
      if (e - s >= MIN_SILENCE_HOLD_SEC) {
        cues.push({ s, e, v: 0 });
      }
      continue;
    }
    if (pending && pending.v === v) {
      pending = { s: pending.s, e, v };
    } else if (pending && s - pending.s < MIN_VISEME_HOLD_SEC) {
      pending = { s: pending.s, e, v: pending.v };
    } else {
      flush();
      pending = { s, e, v };
    }
  }
  flush();
  return coalesceVisemes(cues);
}

async function synthesizeTts({ text, voiceId, modelId }) {
  const body = String(text || '').trim();
  if (env.elevenlabs.apiKey) {
    try {
      const audioBase64 = await elevenLabsTts({ text: body, voiceId, modelId });
      return {
        audioBase64,
        visemes: heuristicVisemesFromText(body),
      };
    } catch (err) {
      if (env.openai.apiKey) {
        const audioBase64 = await openAiTts(body, { voiceId });
        return {
          audioBase64,
          visemes: heuristicVisemesFromText(body),
        };
      }
      throw err;
    }
  }

  const audioBase64 = await openAiTts(body, { voiceId });
  return {
    audioBase64,
    visemes: heuristicVisemesFromText(body),
  };
}

function visemeForChar(raw) {
  if (!raw || !/\S/.test(raw)) return 0;
  const c = String(raw).toLowerCase();
  if ('.,!?;:\'"-—…'.includes(c)) return 0;

  if ('bmp'.includes(c)) return 2;
  if ('fv'.includes(c)) return 10;
  if ('eéê'.includes(c)) return 10;
  if ('aáàâä'.includes(c)) return 6;
  if ('oóòôöuúùûüw'.includes(c)) return 14;
  if ('iíìîıy'.includes(c)) return 14;
  if ('tdnl'.includes(c)) return 6;
  if ('szcj'.includes(c)) return 10;
  if ('kgqh'.includes(c)) return 6;
  if (c === 'r') return 6;
  return 6;
}

function visemesFromAlignment({ characters, starts, ends }) {
  const cues = [];
  const n = Math.min(characters.length, starts.length, ends.length);
  let pending = null;

  function flush() {
    if (pending) cues.push(pending);
    pending = null;
  }

  for (let i = 0; i < n; i += 1) {
    const startSec = Number(starts[i]) || 0;
    const endSec = Number(ends[i]) || startSec;
    if (endSec <= startSec) continue;

    const v = visemeForChar(characters[i]);
    if (
      pending &&
      pending.v === v
    ) {
      pending = { s: pending.s, e: endSec, v };
    } else if (
      pending &&
      pending.v !== 0 &&
      v !== 0 &&
      startSec - pending.s < MIN_VISEME_HOLD_SEC
    ) {
      pending = { s: pending.s, e: endSec, v: pending.v };
    } else if (v === 0) {
      flush();
      if (endSec - startSec >= MIN_SILENCE_HOLD_SEC) {
        cues.push({ s: startSec, e: endSec, v: 0 });
      }
      continue;
    } else {
      flush();
      pending = { s: startSec, e: endSec, v };
    }
  }
  flush();
  return coalesceVisemes(cues);
}

async function synthesizeTtsWithLipsync({ text, voiceId, modelId }) {
  const apiKey = env.elevenlabs.apiKey;
  if (!apiKey) {
    return synthesizeTts({ text, voiceId, modelId });
  }

  const id = resolveVoiceId(voiceId);
  console.log(`[tts/lipsync] elevenLabs voice=${id}`);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${id}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          text: String(text || '').trim(),
          model_id: modelId || 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.8 },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 240)}`);
    }

    const data = await res.json();
    const audioBase64 = data?.audio_base64;
    if (!audioBase64) {
      throw new Error('ElevenLabs audio_base64 missing');
    }

    const alignment =
      data.normalized_alignment || data.alignment || null;
    let visemes = [];
    if (alignment) {
      visemes = visemesFromAlignment({
        characters: (alignment.characters || []).map(String),
        starts: alignment.character_start_times_seconds || [],
        ends: alignment.character_end_times_seconds || [],
      });
    }
    if (!visemes.length) {
      console.warn(
        '[tts/lipsync] alignment empty — heuristic visemes from text',
      );
      visemes = heuristicVisemesFromText(text);
    }

    return { audioBase64, visemes };
  } catch (err) {
    console.warn(
      '[tts/lipsync] with-timestamps failed, fallback TTS:',
      err?.message || err,
    );
    return synthesizeTts({ text, voiceId, modelId });
  }
}

module.exports = {
  transcribeAudio,
  chatComplete,
  translateToLanguage,
  translateToTurkish,
  synthesizeTts,
  synthesizeTtsWithLipsync,
};
