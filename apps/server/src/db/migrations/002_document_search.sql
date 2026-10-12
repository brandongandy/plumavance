CREATE VIRTUAL TABLE document_search USING fts5(
  binder_item_id UNINDEXED,
  title,
  content_text,
  tokenize = 'trigram'
);

INSERT INTO document_search (binder_item_id, title, content_text)
SELECT d.binder_item_id, b.title, d.content_text
FROM documents d
JOIN binder_items b ON b.id = d.binder_item_id;

CREATE TRIGGER document_search_after_document_insert
AFTER INSERT ON documents
BEGIN
  INSERT INTO document_search (binder_item_id, title, content_text)
  SELECT NEW.binder_item_id, b.title, NEW.content_text
  FROM binder_items b
  WHERE b.id = NEW.binder_item_id;
END;

CREATE TRIGGER document_search_after_document_content_update
AFTER UPDATE OF content_text ON documents
BEGIN
  UPDATE document_search
  SET content_text = NEW.content_text
  WHERE binder_item_id = NEW.binder_item_id;
END;

CREATE TRIGGER document_search_after_document_delete
AFTER DELETE ON documents
BEGIN
  DELETE FROM document_search WHERE binder_item_id = OLD.binder_item_id;
END;

CREATE TRIGGER document_search_after_binder_title_update
AFTER UPDATE OF title ON binder_items
WHEN NEW.kind = 'document'
BEGIN
  UPDATE document_search
  SET title = NEW.title
  WHERE binder_item_id = NEW.id;
END;
