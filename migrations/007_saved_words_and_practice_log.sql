-- 007_saved_words_and_practice_log
-- User bookmarks for Word Practice + encounter log so sessions keep rotating
-- through a large vocabulary bank instead of repeating the same handful.

CREATE TABLE IF NOT EXISTS user_saved_words (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  vocabulary_word_id CHAR(36) NOT NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_saved_word (user_id, vocabulary_word_id),
  KEY idx_user_saved_created (user_id, created_at),
  CONSTRAINT fk_saved_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_vocab FOREIGN KEY (vocabulary_word_id) REFERENCES vocabulary_words(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_word_encounters (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  vocabulary_word_id CHAR(36) NOT NULL,
  seen_count INT NOT NULL DEFAULT 1,
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_word_encounter (user_id, vocabulary_word_id),
  KEY idx_encounters_user_seen (user_id, last_seen_at),
  CONSTRAINT fk_encounter_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_encounter_vocab FOREIGN KEY (vocabulary_word_id) REFERENCES vocabulary_words(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
