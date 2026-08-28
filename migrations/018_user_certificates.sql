-- 018_user_certificates — CEFR level completion certificates

CREATE TABLE IF NOT EXISTS user_certificates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  cefr_level VARCHAR(10) NOT NULL,
  verify_token VARCHAR(64) NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cert_user_level (user_id, cefr_level),
  UNIQUE KEY uq_cert_verify_token (verify_token),
  KEY idx_cert_user (user_id),
  CONSTRAINT fk_cert_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
