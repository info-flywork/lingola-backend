-- Practice time of day + window for notification scheduling.
-- daily_reminder_* = window start (or concrete reminder within the slot).
-- practice_window_end_* = window end (flexible / slot range).

ALTER TABLE users
  ADD COLUMN practice_time_of_day VARCHAR(32) NULL
    COMMENT 'morning|afternoon|evening|flexible'
    AFTER daily_reminder_minute,
  ADD COLUMN practice_window_end_hour TINYINT UNSIGNED NULL
    AFTER practice_time_of_day,
  ADD COLUMN practice_window_end_minute TINYINT UNSIGNED NULL
    AFTER practice_window_end_hour;
