PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  pos TEXT,
  level TEXT,
  definition TEXT NOT NULL,
  example TEXT,
  tokens TEXT NOT NULL,          -- JSON array
  rel_tokens TEXT NOT NULL       -- JSON array (syn/hyper/hypo tokens)
);

CREATE INDEX IF NOT EXISTS idx_entries_word ON entries(word);

-- optional search (needs SQLite FTS5 in D1; supported)
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(word, definition, content='entries', content_rowid='id');

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, word, definition) VALUES (new.id, new.word, new.definition);
END;
