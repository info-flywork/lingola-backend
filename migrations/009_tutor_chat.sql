-- 009_tutor_chat
-- Persist tutor text chats so history + multi-tutor sessions work server-side.

CREATE TABLE IF NOT EXISTS tutor_chat_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  tutor_id CHAR(36) NOT NULL,
  title VARCHAR(255) NULL,
  last_message_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_chat_sessions_user (user_id, last_message_at),
  KEY idx_chat_sessions_tutor (tutor_id),
  CONSTRAINT fk_chat_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_session_tutor FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tutor_chat_messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_chat_messages_session (session_id, created_at),
  CONSTRAINT fk_chat_message_session FOREIGN KEY (session_id) REFERENCES tutor_chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
