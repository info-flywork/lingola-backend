-- Kullanıcının sildiği (gizlediği) uygulama içi bildirimler
CREATE TABLE IF NOT EXISTS user_notification_dismissals (
  user_id CHAR(36) NOT NULL,
  notification_id VARCHAR(64) NOT NULL,
  dismissed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, notification_id),
  KEY idx_und_user (user_id),
  CONSTRAINT fk_und_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
