-- 031_roleplay_scenario_images
-- Statik role-play senaryoları için CDN görsel URL'leri (zorluk varyantları dahil).

CREATE TABLE IF NOT EXISTS roleplay_scenario_images (
  scenario_id VARCHAR(64) NOT NULL,
  title_key VARCHAR(64) NOT NULL,
  image_url TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (scenario_id),
  KEY idx_roleplay_scenario_images_title (title_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
