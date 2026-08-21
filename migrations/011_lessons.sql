-- 011_lessons
-- Curriculum catalog, per-user path progress, and tutor-written lesson notes.

CREATE TABLE IF NOT EXISTS lessons (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(96) NOT NULL,
  cefr_level ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2') NOT NULL,
  sort_order INT NOT NULL,
  title_en VARCHAR(255) NOT NULL,
  title_tr VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_lessons_slug (slug),
  UNIQUE KEY uq_lessons_level_order (cefr_level, sort_order),
  KEY idx_lessons_level (cefr_level, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_lesson_progress (
  user_id CHAR(36) NOT NULL,
  lesson_id CHAR(36) NOT NULL,
  status ENUM('locked', 'available', 'completed') NOT NULL DEFAULT 'locked',
  needs_practice TINYINT(1) NOT NULL DEFAULT 0,
  tutor_id CHAR(36) NULL,
  chat_session_id CHAR(36) NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, lesson_id),
  KEY idx_ulp_user_status (user_id, status),
  CONSTRAINT fk_ulp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ulp_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  CONSTRAINT fk_ulp_tutor FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE SET NULL,
  CONSTRAINT fk_ulp_session FOREIGN KEY (chat_session_id) REFERENCES tutor_chat_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_lesson_notes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  lesson_id CHAR(36) NOT NULL,
  tutor_id CHAR(36) NULL,
  chat_session_id CHAR(36) NULL,
  spoken_summary TEXT NOT NULL,
  notes_md MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_uln_user_lesson (user_id, lesson_id),
  CONSTRAINT fk_uln_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uln_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  CONSTRAINT fk_uln_tutor FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tutor_chat_sessions
  ADD COLUMN lesson_slug VARCHAR(96) NULL AFTER title,
  ADD COLUMN kind ENUM('chat', 'lesson', 'practice') NOT NULL DEFAULT 'chat' AFTER lesson_slug;
