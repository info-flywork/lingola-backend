-- 001_init_auth_and_profile
-- Language codes stored as VARCHAR (BCP-47 / app codes) for 12+ locale support — not ENUMs.

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  display_name VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  avatar_url VARCHAR(512) NULL,
  auth_provider ENUM('guest', 'google', 'apple') NOT NULL DEFAULT 'guest',
  is_guest TINYINT(1) NOT NULL DEFAULT 1,
  notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
  app_locale VARCHAR(16) NOT NULL DEFAULT 'en',
  subscription_status ENUM('free', 'premium', 'passive') NOT NULL DEFAULT 'free',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_auth_provider (auth_provider),
  KEY idx_users_app_locale (app_locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_identities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider ENUM('google', 'apple', 'guest') NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_auth_provider_subject (provider, provider_subject),
  KEY idx_auth_identities_user (user_id),
  CONSTRAINT fk_auth_identities_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at DATETIME(3) NULL,
  UNIQUE KEY uq_sessions_token_hash (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  native_language_code VARCHAR(16) NOT NULL,
  target_language_code VARCHAR(16) NOT NULL,
  goal ENUM('career', 'travel', 'livingAbroad', 'studyingAbroad', 'other') NULL,
  level ENUM('beginner', 'intermediate', 'advanced') NULL,
  pace ENUM('light', 'recommended', 'fast') NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_onboarding_native (native_language_code),
  KEY idx_onboarding_target (target_language_code),
  CONSTRAINT fk_onboarding_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
