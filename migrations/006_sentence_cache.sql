-- 006_sentence_cache
-- Tatoeba lookups cost ~600ms each; cache per (word, target, native) so repeat
-- Word Practice loads are instant and we stay friendly to the public API.

CREATE TABLE IF NOT EXISTS sentence_cache (
  id CHAR(36) NOT NULL PRIMARY KEY,
  word VARCHAR(120) NOT NULL,
  target_lang VARCHAR(16) NOT NULL,
  native_lang VARCHAR(16) NOT NULL,
  sentence TEXT NOT NULL,
  sentence_translation TEXT NULL,
  source_sentence_id BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sentence_cache (word, target_lang, native_lang),
  KEY idx_sentence_cache_langs (target_lang, native_lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
