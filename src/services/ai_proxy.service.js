'use strict';

const { env } = require('../config/env');
const {
  prepareTtsText,
  looksMixedLanguage,
} = require('./tts_text_helpers');

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

/** İçerik tipi yanlış gelse bile Whisper'a doğru uzantı/mime ver. */
function sniffAudioFormat(buffer, contentType = '') {
  const ct = String(contentType || '').toLowerCase();
  if (buffer.length >= 4) {
    const head4 = buffer.subarray(0, 4).toString('ascii');
    if (head4 === 'RIFF') {
      return { ext: 'wav', mime: 'audio/wav' };
    }
    if (head4 === 'fLaC') {
      return { ext: 'flac', mime: 'audio/flac' };
    }
    if (head4 === 'OggS') {
      return { ext: 'ogg', mime: 'audio/ogg' };
    }
    if (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
      return { ext: 'm4a', mime: 'audio/mp4' };
    }
    if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
      return { ext: 'mp3', mime: 'audio/mpeg' };
    }
    if (head4 === '\xff\xfb' || head4.startsWith('\xff\xf3')) {
      return { ext: 'mp3', mime: 'audio/mpeg' };
    }
  }

  if (ct.includes('wav')) return { ext: 'wav', mime: 'audio/wav' };
  if (ct.includes('mpeg') || ct.includes('mp3')) {
    return { ext: 'mp3', mime: 'audio/mpeg' };
  }
  if (ct.includes('webm')) return { ext: 'webm', mime: 'audio/webm' };
  if (ct.includes('ogg')) return { ext: 'ogg', mime: 'audio/ogg' };
  if (ct.includes('flac')) return { ext: 'flac', mime: 'audio/flac' };
  return { ext: 'm4a', mime: 'audio/mp4' };
}

async function transcribeAudio({
  audioBase64,
  contentType = 'audio/m4a',
  language,
  prompt,
  nativeLanguageCode,
}) {
  const apiKey = requireOpenAi();
  const {
    englishLearnerWhisperPrompt,
    normalizeLearnerSpeechTranscript,
  } = require('./prompt_helpers');
  const { normalizeLangCode } = require('../utils/locale');

  const buffer = Buffer.from(stripDataUrl(audioBase64), 'base64');
  if (!buffer.length) {
    const err = new Error('Empty audio payload');
    err.status = 400;
    throw err;
  }
  if (buffer.length < 800) {
    const err = new Error('Audio too short or corrupt');
    err.status = 400;
    throw err;
  }

  const sniffed = sniffAudioFormat(buffer, contentType);

  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: sniffed.mime }),
    `speech.${sniffed.ext}`,
  );
  form.append('model', 'whisper-1');
  // Dil verilmezse Whisper otomatik algılar (TR/ES/EN karışık konuşma).
  const lang = String(language || '').trim().toLowerCase().split(/[-_]/)[0];
  if (lang && /^[a-z]{2,3}$/.test(lang)) {
    form.append('language', lang);
  }
  const whisperPrompt =
    String(prompt || '').trim() ||
    englishLearnerWhisperPrompt(
      normalizeLangCode(nativeLanguageCode, 'tr'),
    );
  if (whisperPrompt) {
    form.append('prompt', whisperPrompt.slice(0, 224));
  }
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
  return normalizeLearnerSpeechTranscript(
    String(json.text || '').trim(),
    normalizeLangCode(nativeLanguageCode, 'tr'),
  );
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
  const LINGOLA_VOICE = 'JAATlCsz6GCH2vUjFcLg';
  const resolved = resolveVoiceId(voiceId);
  if (resolved === LINGOLA_VOICE) {
    const err = new Error('Lingola voice must use ElevenLabs only');
    err.status = 502;
    throw err;
  }
  const maleIds = new Set([
    'sJ8GED3d0sN1d0bmD6mH',
    'PIGsltMj3gFMR34aFDI3',
    'uDsPstFWFBUXjIBimV7s',
    'wXvR48IpOq9HACltTmt7',
    'TsHrPyMlNFuIYnbODF01',
  ]);
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

function buildTtsPayload(text, { modelId, nativeLanguageCode, targetLanguageCode }) {
  const spoken = prepareTtsText(text, {
    modelId,
    nativeLanguageCode,
    targetLanguageCode,
  });
  const mixed = looksMixedLanguage(text, nativeLanguageCode);
  return { spoken, mixed };
}

async function elevenLabsTts({
  text,
  voiceId,
  modelId,
  nativeLanguageCode,
  targetLanguageCode,
}) {
  const apiKey = env.elevenlabs.apiKey;
  if (!apiKey) {
    const err = new Error('ELEVENLABS_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const id = resolveVoiceId(voiceId);
  const resolvedModel = modelId || 'eleven_multilingual_v2';
  const { spoken, mixed } = buildTtsPayload(text, {
    modelId: resolvedModel,
    nativeLanguageCode,
    targetLanguageCode,
  });
  console.log(
    `[tts] elevenLabs voice=${id} model=${resolvedModel} len=${spoken.length}` +
      (spoken !== String(text || '').trim() ? ' (mixed-lang prep)' : ''),
  );
  const requestBody = {
    text: spoken,
    model_id: resolvedModel,
    voice_settings: { stability: 0.45, similarity_boost: 0.8 },
  };
  if (mixed) {
    requestBody.language_code = 'auto';
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
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

async function synthesizeTts({
  text,
  voiceId,
  modelId,
  nativeLanguageCode,
  targetLanguageCode,
}) {
  const body = String(text || '').trim();
  const { spoken } = buildTtsPayload(body, {
    modelId,
    nativeLanguageCode,
    targetLanguageCode,
  });
  if (env.elevenlabs.apiKey) {
    try {
      const audioBase64 = await elevenLabsTts({
        text: body,
        voiceId,
        modelId,
        nativeLanguageCode,
        targetLanguageCode,
      });
      return {
        audioBase64,
        visemes: heuristicVisemesFromText(spoken),
      };
    } catch (err) {
      const isLingola = resolveVoiceId(voiceId) === 'JAATlCsz6GCH2vUjFcLg';
      if (isLingola || !env.openai.apiKey) {
        throw err;
      }
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

async function synthesizeTtsWithLipsync({
  text,
  voiceId,
  modelId,
  nativeLanguageCode,
  targetLanguageCode,
}) {
  const apiKey = env.elevenlabs.apiKey;
  if (!apiKey) {
    return synthesizeTts({
      text,
      voiceId,
      modelId,
      nativeLanguageCode,
      targetLanguageCode,
    });
  }

  const id = resolveVoiceId(voiceId);
  const resolvedModel = modelId || 'eleven_multilingual_v2';
  const { spoken, mixed } = buildTtsPayload(text, {
    modelId: resolvedModel,
    nativeLanguageCode,
    targetLanguageCode,
  });
  console.log(
    `[tts/lipsync] elevenLabs voice=${id}` +
      (spoken !== String(text || '').trim() ? ' mixed-lang prep' : ''),
  );
  try {
    const requestBody = {
      text: spoken,
      model_id: resolvedModel,
      voice_settings: { stability: 0.45, similarity_boost: 0.8 },
    };
    if (mixed) {
      requestBody.language_code = 'auto';
    }
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${id}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
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
      visemes = heuristicVisemesFromText(spoken);
    }

    return { audioBase64, visemes };
  } catch (err) {
    console.warn(
      '[tts/lipsync] with-timestamps failed, fallback ElevenLabs (no OpenAI):',
      err?.message || err,
    );
    try {
      const audioBase64 = await elevenLabsTts({
        text,
        voiceId,
        modelId,
        nativeLanguageCode,
        targetLanguageCode,
      });
      const { spoken } = buildTtsPayload(String(text || '').trim(), {
        modelId,
        nativeLanguageCode,
        targetLanguageCode,
      });
      return {
        audioBase64,
        visemes: heuristicVisemesFromText(spoken),
      };
    } catch (fallbackErr) {
      console.warn(
        '[tts/lipsync] ElevenLabs plain fallback failed:',
        fallbackErr?.message || fallbackErr,
      );
      if (resolveVoiceId(voiceId) === 'JAATlCsz6GCH2vUjFcLg') {
        throw fallbackErr;
      }
      return synthesizeTts({
        text,
        voiceId,
        modelId,
        nativeLanguageCode,
        targetLanguageCode,
      });
    }
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
