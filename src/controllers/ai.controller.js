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
    const text = await ai.translateToTurkish(req.body?.text);
    res.json({ ok: true, text });
  } catch (err) {
    next(err);
  }
}

async function tts(req, res, next) {
  try {
    const payload = await ai.synthesizeTts({
      text: req.body?.text,
      voiceId: req.body?.voiceId,
      modelId: req.body?.modelId,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    next(err);
  }
}

async function ttsLipsync(req, res, next) {
  try {
    const payload = await ai.synthesizeTtsWithLipsync({
      text: req.body?.text,
      voiceId: req.body?.voiceId,
      modelId: req.body?.modelId,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
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
