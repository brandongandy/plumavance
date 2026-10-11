CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);

CREATE TABLE binder_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES binder_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'document')),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  trashed_at TEXT,
  trashed_parent_id TEXT,
  trashed_position INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX binder_items_project_parent_position
  ON binder_items(project_id, parent_id, position);
CREATE INDEX binder_items_project_trashed
  ON binder_items(project_id, trashed_at);

CREATE TABLE documents (
  binder_item_id TEXT PRIMARY KEY REFERENCES binder_items(id) ON DELETE CASCADE,
  content_json TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  notes_text TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  saved_at TEXT NOT NULL
);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(binder_item_id) ON DELETE CASCADE,
  name TEXT,
  content_json TEXT NOT NULL,
  content_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX snapshots_document_created
  ON snapshots(document_id, created_at DESC);
