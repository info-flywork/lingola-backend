CREATE TABLE IF NOT EXISTS user_daily_activity (
  user_id CHAR(36) NOT NULL,
  activity_date DATE NOT NULL,
  source ENUM('lesson', 'chat', 'practice') NOT NULL,
  event_count INT NOT NULL DEFAULT 1,
  first_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, activity_date, source),
  KEY idx_uda_user_date (user_id, activity_date),
  CONSTRAINT fk_uda_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
