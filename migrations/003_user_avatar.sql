-- 003_user_avatar
-- Profile photo: users.avatar_url already existed in 001 (Google/Apple).
-- Widen for Bunny CDN URLs and document as the canonical profile picture column.

ALTER TABLE users
  MODIFY COLUMN avatar_url VARCHAR(1024) NULL
  COMMENT 'Profile picture CDN/URL (Google/Apple or users/{id}/avatar.*)';
