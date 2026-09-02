-- 026_daily_reminder_time
-- User-selected daily practice reminder time (local device timezone on client).

ALTER TABLE users
  ADD COLUMN daily_reminder_hour TINYINT UNSIGNED NOT NULL DEFAULT 15
    AFTER notifications_enabled,
  ADD COLUMN daily_reminder_minute TINYINT UNSIGNED NOT NULL DEFAULT 0
    AFTER daily_reminder_hour;
