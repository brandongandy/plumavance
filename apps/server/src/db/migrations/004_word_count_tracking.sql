ALTER TABLE projects ADD COLUMN project_word_target INTEGER
  CHECK (project_word_target IS NULL OR (typeof(project_word_target) = 'integer' AND project_word_target > 0));
ALTER TABLE projects ADD COLUMN daily_word_target INTEGER
  CHECK (daily_word_target IS NULL OR (typeof(daily_word_target) = 'integer' AND daily_word_target > 0));
ALTER TABLE projects ADD COLUMN daily_count_mode TEXT NOT NULL DEFAULT 'additions'
  CHECK (daily_count_mode IN ('additions', 'net'));

CREATE TABLE word_count_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  delta INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX word_count_events_project_date ON word_count_events (project_id, local_date);
