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

async function translateToTurkish(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  return chatComplete({
    messages: [
      {
        role: 'system',
        content:
          'You translate English to Turkish for language learners. '
          + 'Reply with only the Turkish translation, nothing else. '
          + 'Keep it natural and concise.',
      },
      { role: 'user', content: trimmed },
    ],
    temperature: 0.2,
    maxTokens: 200,
  });
}

async function openAiTts(text) {
  const apiKey = requireOpenAi();
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'nova',
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

async function synthesizeTts({ text, voiceId, modelId }) {
  if (env.elevenlabs.apiKey) {
    try {
      const audioBase64 = await elevenLabsTts({ text, voiceId, modelId });
      return { audioBase64, visemes: [] };
    } catch (err) {
      if (env.openai.apiKey) {
        const audioBase64 = await openAiTts(text);
        return { audioBase64, visemes: [] };
      }
      throw err;
    }
  }

  const audioBase64 = await openAiTts(text);
  return { audioBase64, visemes: [] };
}

function visemesFromAlignment({ characters, starts, ends }) {
  const cues = [];
  const n = Math.min(characters.length, starts.length, ends.length);
  for (let i = 0; i < n; i += 1) {
    const ch = characters[i];
    if (!ch || !/\S/.test(ch)) continue;
    const startSec = Number(starts[i]) || 0;
    const endSec = Number(ends[i]) || startSec;
    const code = ch.toLowerCase().charCodeAt(0);
    let visemeNum = 0;
    if ('aáàâä'.includes(ch.toLowerCase())) visemeNum = 1;
    else if ('eéèêë'.includes(ch.toLowerCase())) visemeNum = 2;
    else if ('iíìîï'.includes(ch.toLowerCase())) visemeNum = 3;
    else if ('oóòôö'.includes(ch.toLowerCase())) visemeNum = 4;
    else if ('uúùûü'.includes(ch.toLowerCase())) visemeNum = 5;
    else if ('bp'.includes(ch.toLowerCase())) visemeNum = 6;
    else if ('fv'.includes(ch.toLowerCase())) visemeNum = 7;
    else if ('td'.includes(ch.toLowerCase())) visemeNum = 8;
    else if ('kg'.includes(ch.toLowerCase())) visemeNum = 9;
    else if ('sz'.includes(ch.toLowerCase())) visemeNum = 10;
    else visemeNum = code % 11;
    cues.push({ s: startSec, e: endSec, v: visemeNum });
  }
  return cues;
}

async function synthesizeTtsWithLipsync({ text, voiceId, modelId }) {
  const apiKey = env.elevenlabs.apiKey;
  if (!apiKey) {
    return synthesizeTts({ text, voiceId, modelId });
  }

  const id = resolveVoiceId(voiceId);
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

    return { audioBase64, visemes };
  } catch (_) {
    return synthesizeTts({ text, voiceId, modelId });
  }
}

module.exports = {
  transcribeAudio,
  chatComplete,
  translateToTurkish,
  synthesizeTts,
  synthesizeTtsWithLipsync,
};
