'use strict';

/** All profile UI languages — each has translate_XX / sentence_XX on Word table. */
const PROFILE_LANGUAGES = ['en', 'de', 'it', 'fr', 'tr', 'ja', 'es', 'ru', 'hi', 'pt', 'zh'];

/** Already populated in Word; seed script fills the rest. */
const SEED_LANGUAGES = ['ja', 'fr', 'es', 'ru', 'hi', 'pt', 'zh', 'it'];

function normalizeLangCode(raw, fallback = 'tr') {
  if (!raw || typeof raw !== 'string') return fallback;
  let code = raw.trim().toLowerCase().split(/[-_]/)[0];
  if (code === 'jp') code = 'ja';
  if (!code) return fallback;
  return code;
}

/**
 * Language used for vocabulary glosses and example translations.
 * Profile app locale (UI language) takes priority when it is not English.
 */
function resolveContentNativeLang(user) {
  const app = normalizeLangCode(user?.appLocale, 'en');
  const native = normalizeLangCode(user?.onboarding?.nativeLanguageCode, 'tr');
  if (app && app !== 'en') return app;
  return native;
}

const LANGUAGE_DISPLAY_NAMES = {
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  it: 'Italian',
  fr: 'French',
  ja: 'Japanese',
  es: 'Spanish',
  ru: 'Russian',
  hi: 'Hindi',
  pt: 'Portuguese',
  zh: 'Chinese',
};

function languageDisplayName(code, fallback = 'English') {
  const normalized = normalizeLangCode(code, '');
  return LANGUAGE_DISPLAY_NAMES[normalized] || fallback;
}

module.exports = {
  PROFILE_LANGUAGES,
  SEED_LANGUAGES,
  normalizeLangCode,
  resolveContentNativeLang,
  languageDisplayName,
};
