-- 016_word_translation_cache
-- Cache OpenAI (or other) glosses for Word rows in languages beyond tr/de/en.

CREATE TABLE IF NOT EXISTS word_translation_cache (
  id CHAR(36) NOT NULL PRIMARY KEY,
  word_id CHAR(36) NOT NULL,
  native_lang VARCHAR(16) NOT NULL,
  translate_native TEXT NOT NULL,
  sentence_native TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_word_translation (word_id, native_lang),
  KEY idx_word_translation_lang (native_lang),
  CONSTRAINT fk_word_translation_word FOREIGN KEY (word_id) REFERENCES Word(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
