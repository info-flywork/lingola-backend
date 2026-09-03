-- 028_roleplay_image_url_text
-- DALL-E / CDN URL'leri 512 karakteri aşabiliyor; kırpılınca görsel yüklenmiyor.

ALTER TABLE user_roleplay_scenarios
  MODIFY image_url TEXT NULL;
