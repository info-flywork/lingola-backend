-- 021_roleplay_progress
-- Track role-play time per scenario (8 min = 100%).

CREATE TABLE IF NOT EXISTS roleplay_progress (
  user_id CHAR(36) NOT NULL,
  scenario_id VARCHAR(32) NOT NULL,
  session_id CHAR(36) NULL,
  elapsed_seconds INT NOT NULL DEFAULT 0,
  progress_percent DECIMAL(5, 4) NOT NULL DEFAULT 0,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, scenario_id),
  KEY idx_roleplay_progress_session (session_id),
  CONSTRAINT fk_roleplay_progress_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_roleplay_progress_session
    FOREIGN KEY (session_id) REFERENCES tutor_chat_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
