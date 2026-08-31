ALTER TABLE user_onboarding
  ADD COLUMN explanation_language ENUM('native', 'english') NOT NULL DEFAULT 'native'
  AFTER pace;
