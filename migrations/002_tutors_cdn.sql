-- 002_tutors_cdn
-- Tutor catalog: stable slug/tag keys for i18n; CDN URLs for riv + portrait.

CREATE TABLE IF NOT EXISTS tutors (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  name_key VARCHAR(64) NOT NULL,
  tag_keys JSON NOT NULL,
  voice_id VARCHAR(64) NULL,
  image_cdn_url VARCHAR(512) NULL,
  rive_cdn_url VARCHAR(512) NULL,
  local_image_path VARCHAR(255) NULL,
  local_rive_path VARCHAR(255) NULL,
  flag_asset_path VARCHAR(255) NULL,
  theme_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tutors_slug (slug),
  KEY idx_tutors_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
