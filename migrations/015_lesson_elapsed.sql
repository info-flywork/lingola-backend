-- 015_lesson_elapsed
-- Track active lesson time so Home "Continue" shows remaining minutes.

ALTER TABLE user_lesson_progress
  ADD COLUMN elapsed_seconds INT NOT NULL DEFAULT 0
    AFTER started_at;
