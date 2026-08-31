'use strict';

/** A1–A2 İngilizce ders kelimeleri — CMU Arpabet (ElevenLabs flash/turbo). */
const ENGLISH_LESSON_PHONEMES = {
  hi: 'HH AY1',
  hey: 'HH EY1',
  hello: 'HH AH0 L OW1',
  goodbye: 'G UH0 D B AY1',
  thanks: 'TH AE1 NG K S',
  please: 'P L IY1 Z',
  yes: 'Y EH1 S',
  no: 'N OW1',
  good: 'G UH1 D',
  morning: 'M AO1 R N IH0 NG',
  afternoon: 'AE2 F T ER0 N UW1 N',
  evening: 'IY1 V N IH0 NG',
  night: 'N AY1 T',
  how: 'HH AW1',
  are: 'AA1 R',
  you: 'Y UW1',
  fine: 'F AY1 N',
  okay: 'OW2 K EY1',
  ok: 'OW2 K EY1',
  well: 'W EH1 L',
  name: 'N EY1 M',
  nice: 'N AY1 S',
  meet: 'M IY1 T',
  welcome: 'W EH1 L K AH0 M',
};

/** Tırnaksız eşlemede güvenli — Türkçe kelime içinde geçmez. */
const UNQUOTED_LESSON_WORDS = ['hi', 'hey', 'hello'];

/** Phoneme desteklemeyen modeller için Türkçe TTS'te yaklaşık telaffuz. */
const PHONETIC_ALIAS_TR = {
  hi: 'hay',
  hey: 'hey',
};

function modelSupportsPhonemeTags(modelId) {
  const m = String(modelId || '').toLowerCase();
  return m.includes('flash') || m.includes('turbo');
}

function normalizeLangCode(code, fallback = 'en') {
  const raw = String(code || fallback).trim().toLowerCase();
  if (!raw) return fallback;
  return raw.split(/[-_]/)[0];
}

function looksLikeNativeExplanation(text, nativeCode) {
  const native = normalizeLangCode(nativeCode, 'en');
  if (native === 'en') return false;

  const body = String(text || '');
  if (native === 'tr') {
    if (/[çğıöşüÇĞİÖŞÜ]/.test(body)) return true;
    if (
      /\b(harika|merhaba|güzel|dedin|dedi|de|ve|için|bir|şimdi|evet|hayır|bence|daha|iyi|olur|ister|misin|nasılsın|kullan|öğren|açıklama|tamam|elbette)\b/i.test(
        body,
      )
    ) {
      return true;
    }
  }

  return native !== 'en';
}

function looksMixedLanguage(text, nativeCode) {
  return looksLikeNativeExplanation(text, nativeCode);
}

function phoneticAlias(word, nativeCode) {
  const key = String(word || '').toLowerCase();
  if (normalizeLangCode(nativeCode) === 'tr') {
    return PHONETIC_ALIAS_TR[key] || word;
  }
  return word;
}

function wrapPhoneme(word, phoneme) {
  return `<phoneme alphabet="cmu-arpabet" ph="${phoneme}">${word}</phoneme>`;
}

function isInsidePhonemeTag(text, index) {
  const before = String(text || '').slice(0, index);
  const lastOpen = before.lastIndexOf('<phoneme');
  const lastClose = before.lastIndexOf('</phoneme>');
  return lastOpen > lastClose;
}

function touchesNonAsciiLetter(text, start, end) {
  const before = text[start - 1];
  const after = text[end];
  return (
    (before && /[^\x00-\x7F]/.test(before)) ||
    (after && /[^\x00-\x7F]/.test(after))
  );
}

function replaceEnglishLessonToken(match, wordPart, punct, usePhoneme, nativeCode) {
  const key = String(wordPart || '').trim().toLowerCase();
  const phoneme = ENGLISH_LESSON_PHONEMES[key];
  if (!phoneme) return match;

  const surface = String(wordPart || '').trim();
  if (usePhoneme) {
    return `${wrapPhoneme(surface, phoneme)}${punct || ''}`;
  }
  return `${phoneticAlias(surface, nativeCode)}${punct || ''}`;
}

/**
 * Anadil açıklama + gömülü İngilizce ders kelimeleri için TTS metni.
 * Ekrandaki metin aynı kalır; yalnızca ses sentezi öncesi dönüştürülür.
 */
function prepareTtsText(
  text,
  { modelId, nativeLanguageCode, targetLanguageCode = 'en' } = {},
) {
  const raw = String(text || '').trim();
  if (!raw) return raw;

  const nativeCode = normalizeLangCode(nativeLanguageCode, 'en');
  const targetCode = normalizeLangCode(targetLanguageCode, 'en');
  if (targetCode !== 'en' || !looksLikeNativeExplanation(raw, nativeCode)) {
    return raw;
  }

  const usePhoneme = modelSupportsPhonemeTags(modelId);
  let out = raw;

  // 'Hi', "Hello" gibi tırnaklı ders kelimeleri
  out = out.replace(
    /(['"])([A-Za-z][A-Za-z' -]{0,40}?)(['"])/g,
    (match, _q1, word, _q2, offset, whole) => {
      if (whole.slice(Math.max(0, offset - 8), offset).includes('<phoneme')) {
        return match;
      }
      const punctMatch = word.match(/^(.+?)([.!?,…]*)$/);
      const core = punctMatch ? punctMatch[1] : word;
      const punct = punctMatch ? punctMatch[2] : '';
      return replaceEnglishLessonToken(match, core, punct, usePhoneme, nativeCode);
    },
  );

  // Tırnaksız selamlaşma kelimeleri — yalnızca ASCII sınırlı
  for (const word of UNQUOTED_LESSON_WORDS) {
    const phoneme = ENGLISH_LESSON_PHONEMES[word];
    const re = new RegExp(`\\b(${word})\\b`, 'gi');
    out = out.replace(re, (match, captured, offset) => {
      if (isInsidePhonemeTag(out, offset)) return match;
      if (touchesNonAsciiLetter(out, offset, offset + match.length)) {
        return match;
      }
      if (usePhoneme) {
        return wrapPhoneme(captured, phoneme);
      }
      return phoneticAlias(captured, nativeCode);
    });
  }

  return out;
}

module.exports = {
  prepareTtsText,
  looksMixedLanguage,
  modelSupportsPhonemeTags,
  ENGLISH_LESSON_PHONEMES,
};
