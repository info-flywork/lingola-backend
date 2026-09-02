-- 027_daily_pace_minutes
-- Günlük hedef: light/recommended/fast → min5/min10/min15/min30/min60

ALTER TABLE user_onboarding
  MODIFY pace ENUM(
    'light', 'recommended', 'fast',
    'min5', 'min10', 'min15', 'min30', 'min60'
  ) NULL;

UPDATE user_onboarding SET pace = 'min5' WHERE pace = 'light';
UPDATE user_onboarding SET pace = 'min15' WHERE pace = 'recommended';
UPDATE user_onboarding SET pace = 'min30' WHERE pace = 'fast';

ALTER TABLE user_onboarding
  MODIFY pace ENUM('min5', 'min10', 'min15', 'min30', 'min60') NULL DEFAULT 'min15';
