CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    raw BLOB NOT NULL,
    envelope TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'incoming',
    status TEXT NOT NULL CHECK(status IN ('pending','processing','completed','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    received_at INTEGER NOT NULL,
    completed_at INTEGER,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status,received_at);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    normalized_subject TEXT NOT NULL,
    thread_key TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    recipients TEXT NOT NULL,
    cc TEXT NOT NULL,
    envelope_to TEXT NOT NULL,
    snippet TEXT NOT NULL,
    text TEXT NOT NULL,
    html TEXT NOT NULL,
    raw BLOB NOT NULL,
    received_at INTEGER NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    starred INTEGER NOT NULL DEFAULT 0,
    important INTEGER NOT NULL DEFAULT 0,
    is_sent INTEGER NOT NULL DEFAULT 0,
    folder TEXT NOT NULL DEFAULT 'inbox',
    category TEXT NOT NULL DEFAULT 'primary',
    snoozed_until INTEGER
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id,received_at);
CREATE INDEX IF NOT EXISTS messages_header_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS messages_thread_key ON messages(thread_key,received_at);
CREATE INDEX IF NOT EXISTS messages_folder ON messages(folder,received_at DESC);
CREATE INDEX IF NOT EXISTS messages_sent ON messages(is_sent,received_at DESC);
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    content BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_message ON attachments(message_id);
CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#2a6b53'
);
CREATE TABLE IF NOT EXISTS message_labels (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY(message_id,label_id)
);
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    field TEXT NOT NULL,
    contains TEXT NOT NULL,
    action TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    sending INTEGER NOT NULL DEFAULT 0
);
CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
    subject, sender, sender_email, recipients, text,
    content='messages', content_rowid='rowid', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS messages_search_insert AFTER INSERT ON messages BEGIN
    INSERT INTO message_search(rowid,subject,sender,sender_email,recipients,text)
    VALUES(new.rowid,new.subject,new.sender,new.sender_email,new.recipients,new.text);
END;
CREATE TRIGGER IF NOT EXISTS messages_search_delete AFTER DELETE ON messages BEGIN
    INSERT INTO message_search(message_search,rowid,subject,sender,sender_email,recipients,text)
    VALUES('delete',old.rowid,old.subject,old.sender,old.sender_email,old.recipients,old.text);
END;
