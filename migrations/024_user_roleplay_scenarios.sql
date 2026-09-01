-- 024_user_roleplay_scenarios
-- User-created role-play scenarios with AI-generated content.

CREATE TABLE IF NOT EXISTS user_roleplay_scenarios (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(200) NOT NULL,
  screenplay TEXT NOT NULL,
  opening_message TEXT NOT NULL,
  prompt_payload JSON NOT NULL,
  image_url VARCHAR(512) NULL,
  minutes INT NOT NULL DEFAULT 8,
  level_key VARCHAR(32) NOT NULL DEFAULT 'beginner',
  sort_order INT NOT NULL DEFAULT 1000,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_user_roleplay_scenarios_user (user_id, sort_order),
  CONSTRAINT fk_user_roleplay_scenarios_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE roleplay_progress
  MODIFY scenario_id VARCHAR(64) NOT NULL;
