
-- answer_rank
CREATE TABLE IF NOT EXISTS answer_rank (
  date_key TEXT NOT NULL,
  word_id  TEXT NOT NULL,
  rank     INTEGER NOT NULL,
  score    REAL NOT NULL,
  PRIMARY KEY (date_key, word_id)
);
CREATE INDEX IF NOT EXISTS idx_answer_rank_date_rank
ON answer_rank (date_key, rank);

-- FTS for meanings
CREATE VIRTUAL TABLE IF NOT EXISTS answer_sense_fts
USING fts5(
  definition,
  word_id UNINDEXED,
  sense_rank UNINDEXED,
  tokenize='unicode61'
);

-- initial backfill (run once; batch if huge)
INSERT INTO answer_sense_fts (rowid, definition, word_id, sense_rank)
SELECT rowid, definition, word_id, sense_rank
FROM answer_sense;

-- performance indexes
CREATE INDEX IF NOT EXISTS idx_lex_entry_display_word ON lex_entry(display_word);
CREATE INDEX IF NOT EXISTS idx_lex_entry_match_key ON lex_entry(match_key);
CREATE INDEX IF NOT EXISTS idx_answer_pool_match_key ON answer_pool(match_key);
CREATE INDEX IF NOT EXISTS idx_answer_sense_word_id ON answer_sense(word_id);
