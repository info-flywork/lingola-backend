-- 008_vocabulary_goal_tag
-- Tag words by onboarding goal (travel, career, …) so sessions can mix
-- ~50% goal-themed + ~50% general without regenerating existing bank entries.

ALTER TABLE vocabulary_words
  ADD COLUMN goal_tag VARCHAR(32) NULL
    COMMENT 'career|travel|livingAbroad|studyingAbroad|other|general'
    AFTER level,
  ADD KEY idx_vocab_goal_level (target_lang, level, goal_tag, is_active);
