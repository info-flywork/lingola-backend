-- 013_lesson_score
-- Learner score + participation on lesson notes; best score on progress.

ALTER TABLE user_lesson_notes
  ADD COLUMN score TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER notes_md,
  ADD COLUMN previous_score TINYINT UNSIGNED NULL AFTER score,
  ADD COLUMN participation VARCHAR(24) NOT NULL DEFAULT 'silent' AFTER previous_score,
  ADD COLUMN evaluation TEXT NULL AFTER participation,
  ADD COLUMN user_turns INT NOT NULL DEFAULT 0 AFTER evaluation,
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 1 AFTER user_turns;

ALTER TABLE user_lesson_progress
  ADD COLUMN last_score TINYINT UNSIGNED NULL AFTER needs_practice,
  ADD COLUMN best_score TINYINT UNSIGNED NULL AFTER last_score;
