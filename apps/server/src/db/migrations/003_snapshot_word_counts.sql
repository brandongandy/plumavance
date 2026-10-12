ALTER TABLE snapshots
  ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;

UPDATE snapshots
SET word_count = pluma_word_count(content_text);
