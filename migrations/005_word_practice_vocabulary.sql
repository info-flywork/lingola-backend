-- 005_word_practice_vocabulary
-- Word Practice: curated target words by CEFR-ish level + optional native glosses.
-- App UI language (users.app_locale) is NOT used here.
-- Content languages come from user_onboarding.native/target_language_code + level.

CREATE TABLE IF NOT EXISTS vocabulary_words (
  id CHAR(36) NOT NULL PRIMARY KEY,
  word VARCHAR(120) NOT NULL,
  phonetic VARCHAR(120) NULL,
  target_lang VARCHAR(16) NOT NULL DEFAULT 'en',
  level ENUM('beginner', 'intermediate', 'advanced') NOT NULL DEFAULT 'beginner',
  glosses_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_vocab_target_word_level (target_lang, word, level),
  KEY idx_vocab_level_lang (level, target_lang, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
