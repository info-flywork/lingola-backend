-- 017_word_all_language_columns
-- Profile languages: same shape as translate_tr / sentence_tr for every locale.

ALTER TABLE Word
  ADD COLUMN translate_ja TEXT NULL AFTER translate_de,
  ADD COLUMN translate_fr TEXT NULL AFTER translate_ja,
  ADD COLUMN translate_es TEXT NULL AFTER translate_fr,
  ADD COLUMN translate_ru TEXT NULL AFTER translate_es,
  ADD COLUMN translate_hi TEXT NULL AFTER translate_ru,
  ADD COLUMN translate_pt TEXT NULL AFTER translate_hi,
  ADD COLUMN translate_zh TEXT NULL AFTER translate_pt,
  ADD COLUMN translate_it TEXT NULL AFTER translate_zh,
  ADD COLUMN pronunciation_ja TEXT NULL AFTER pronunciation_de,
  ADD COLUMN pronunciation_fr TEXT NULL AFTER pronunciation_ja,
  ADD COLUMN pronunciation_es TEXT NULL AFTER pronunciation_fr,
  ADD COLUMN pronunciation_ru TEXT NULL AFTER pronunciation_es,
  ADD COLUMN pronunciation_hi TEXT NULL AFTER pronunciation_ru,
  ADD COLUMN pronunciation_pt TEXT NULL AFTER pronunciation_hi,
  ADD COLUMN pronunciation_zh TEXT NULL AFTER pronunciation_pt,
  ADD COLUMN pronunciation_it TEXT NULL AFTER pronunciation_zh,
  ADD COLUMN sentence_ja TEXT NULL AFTER sentence_de,
  ADD COLUMN sentence_fr TEXT NULL AFTER sentence_ja,
  ADD COLUMN sentence_es TEXT NULL AFTER sentence_fr,
  ADD COLUMN sentence_ru TEXT NULL AFTER sentence_es,
  ADD COLUMN sentence_hi TEXT NULL AFTER sentence_ru,
  ADD COLUMN sentence_pt TEXT NULL AFTER sentence_hi,
  ADD COLUMN sentence_zh TEXT NULL AFTER sentence_pt,
  ADD COLUMN sentence_it TEXT NULL AFTER sentence_zh;
