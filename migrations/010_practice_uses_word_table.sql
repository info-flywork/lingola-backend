-- 010_practice_uses_word_table
-- Word Practice now serves from the curated `Word` table (sentences and
-- pronunciations ship with the row), so saves/encounters must key off Word.id
-- instead of the old generated vocabulary_words bank.

ALTER TABLE user_saved_words DROP FOREIGN KEY fk_saved_vocab;
ALTER TABLE user_word_encounters DROP FOREIGN KEY fk_encounter_vocab;

DELETE FROM user_saved_words
WHERE vocabulary_word_id NOT IN (SELECT id FROM Word);

DELETE FROM user_word_encounters
WHERE vocabulary_word_id NOT IN (SELECT id FROM Word);

ALTER TABLE user_saved_words
  CHANGE COLUMN vocabulary_word_id word_id VARCHAR(36) NOT NULL;

ALTER TABLE user_word_encounters
  CHANGE COLUMN vocabulary_word_id word_id VARCHAR(36) NOT NULL;

ALTER TABLE user_saved_words
  ADD CONSTRAINT fk_saved_word FOREIGN KEY (word_id) REFERENCES Word(id) ON DELETE CASCADE;

ALTER TABLE user_word_encounters
  ADD CONSTRAINT fk_encounter_word FOREIGN KEY (word_id) REFERENCES Word(id) ON DELETE CASCADE;
