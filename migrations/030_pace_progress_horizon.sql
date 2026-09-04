-- 030_pace_progress_horizon
-- Günlük dk → anlamlıleme ufku (1 ay / 2-3 ay / 6 ay / 1 yıl / acele yok)

ALTER TABLE user_onboarding
  MODIFY pace ENUM(
    'min5', 'min10', 'min15', 'min30', 'min60',
    'month1', 'month2_3', 'month6', 'year1', 'relaxed'
  ) NULL;

UPDATE user_onboarding SET pace = 'month1' WHERE pace = 'min60';
UPDATE user_onboarding SET pace = 'month2_3' WHERE pace = 'min30';
UPDATE user_onboarding SET pace = 'month6' WHERE pace = 'min15';
UPDATE user_onboarding SET pace = 'year1' WHERE pace = 'min10';
UPDATE user_onboarding SET pace = 'relaxed' WHERE pace = 'min5';

ALTER TABLE user_onboarding
  MODIFY pace ENUM(
    'month1', 'month2_3', 'month6', 'year1', 'relaxed'
  ) NULL DEFAULT 'month2_3';
