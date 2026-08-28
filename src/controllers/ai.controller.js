'use strict';

const ai = require('../services/ai_proxy.service');

async function transcribe(req, res, next) {
  try {
    const text = await ai.transcribeAudio({
      audioBase64: req.body?.audioBase64,
      contentType: req.body?.contentType,
    });
    res.json({ ok: true, text });
  } catch (err) {
    next(err);
  }
}

async function chat(req, res, next) {
  try {
    const text = await ai.chatComplete({
      messages: req.body?.messages,
      temperature: req.body?.temperature,
      maxTokens: req.body?.maxTokens,
    });
    res.json({ ok: true, text });
  } catch (err) {
    next(err);
  }
}

async function translate(req, res, next) {
  try {
    const targetLang = req.body?.targetLang ?? req.body?.nativeLang ?? 'tr';
    const text = await ai.translateToLanguage(req.body?.text, targetLang);
    res.json({ ok: true, text, targetLang });
  } catch (err) {
    next(err);
  }
}

async function tts(req, res, next) {
  try {
    const text = String(req.body?.text || '');
    console.log(
      `[ai:tts] start voice=${req.body?.voiceId || '-'} model=${req.body?.modelId || '-'} text.len=${text.length}`,
    );
    const payload = await ai.synthesizeTts({
      text: req.body?.text,
      voiceId: req.body?.voiceId,
      modelId: req.body?.modelId,
    });
    console.log(
      `[ai:tts] done audio.len=${payload?.audioBase64?.length || 0} visemes=${payload?.visemes?.length || 0}`,
    );
    res.json({ ok: true, ...payload });
  } catch (err) {
    console.error('[ai:tts] fail:', err?.message || err);
    next(err);
  }
}

async function ttsLipsync(req, res, next) {
  try {
    const text = String(req.body?.text || '');
    console.log(
      `[ai:tts/lipsync] start voice=${req.body?.voiceId || '-'} model=${req.body?.modelId || '-'} text.len=${text.length} preview="${text.slice(0, 80)}"`,
    );
    const payload = await ai.synthesizeTtsWithLipsync({
      text: req.body?.text,
      voiceId: req.body?.voiceId,
      modelId: req.body?.modelId,
    });
    const v = payload?.visemes?.length || 0;
    console.log(
      `[ai:tts/lipsync] done audio.len=${payload?.audioBase64?.length || 0} visemes=${v}` +
        (v === 0 ? ' ⚠️ EMPTY_VISEMES' : ''),
    );
    res.json({ ok: true, ...payload });
  } catch (err) {
    console.error('[ai:tts/lipsync] fail:', err?.message || err);
    next(err);
  }
}

module.exports = {
  transcribe,
  chat,
  translate,
  tts,
  ttsLipsync,
};
