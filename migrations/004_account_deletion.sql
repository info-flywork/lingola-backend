-- 004_account_deletion
-- Delete-account funnel: survey feedback, retention offers, scheduled soft-delete with grace period.

ALTER TABLE users
  ADD COLUMN deletion_requested_at DATETIME(3) NULL AFTER deleted_at,
  ADD COLUMN access_until DATETIME(3) NULL AFTER deletion_requested_at;

ALTER TABLE users
  ADD KEY idx_users_deletion_requested (deletion_requested_at),
  ADD KEY idx_users_access_until (access_until);

CREATE TABLE IF NOT EXISTS account_deletion_feedback (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  reason_label VARCHAR(255) NULL,
  message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_deletion_feedback_user (user_id),
  KEY idx_deletion_feedback_reason (reason_code),
  CONSTRAINT fk_deletion_feedback_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS retention_offer_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  offer_type ENUM('monthly_plan', 'discount_60') NOT NULL,
  action ENUM('shown', 'accepted', 'declined') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_retention_user (user_id),
  KEY idx_retention_offer (offer_type),
  CONSTRAINT fk_retention_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
