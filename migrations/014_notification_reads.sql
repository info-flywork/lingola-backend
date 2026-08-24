-- 014_notification_reads
-- Per-user read state for in-app notification inbox.

CREATE TABLE IF NOT EXISTS user_notification_reads (
  user_id CHAR(36) NOT NULL,
  notification_id VARCHAR(64) NOT NULL,
  read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, notification_id),
  KEY idx_unr_user (user_id),
  CONSTRAINT fk_unr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
