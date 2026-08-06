'use strict';

/**
 * App uses ISO 639-1 (en, tr, …). Tatoeba API v1 expects ISO 639-3 (eng, tur, …).
 */
const ISO1_TO_ISO3 = {
  en: 'eng',
  tr: 'tur',
  de: 'deu',
  it: 'ita',
  fr: 'fra',
  es: 'spa',
  pt: 'por',
  ko: 'kor',
  ja: 'jpn',
  zh: 'cmn',
  ar: 'ara',
  hi: 'hin',
  ru: 'rus',
  nl: 'nld',
  pl: 'pol',
};

function toTatoebaLang(code) {
  if (!code || typeof code !== 'string') return 'eng';
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  return ISO1_TO_ISO3[base] || base;
}

module.exports = { toTatoebaLang, ISO1_TO_ISO3 };
