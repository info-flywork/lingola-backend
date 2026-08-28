-- 020_user_notifications
-- Gerçek kullanıcı bildirim geçmişi (yerel push → inbox → backend sync).

CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  client_key VARCHAR(128) NOT NULL,
  notification_type VARCHAR(64) NOT NULL DEFAULT 'reminder',
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  icon_asset VARCHAR(255) NULL,
  icon_bg VARCHAR(16) NULL,
  title_color VARCHAR(16) NULL,
  delivered_at DATETIME(3) NOT NULL,
  read_at DATETIME(3) NULL,
  dismissed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_notif_client (user_id, client_key),
  KEY idx_user_notif_user_delivered (user_id, delivered_at DESC),
  CONSTRAINT fk_user_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
