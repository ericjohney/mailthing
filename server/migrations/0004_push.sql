CREATE TABLE push_devices (
    token TEXT PRIMARY KEY,
    environment TEXT NOT NULL CHECK(environment IN ('sandbox','production')),
    registered_at INTEGER NOT NULL
);
CREATE TABLE push_deliveries (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    token TEXT NOT NULL REFERENCES push_devices(token) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    PRIMARY KEY(message_id,token)
);
CREATE INDEX push_deliveries_due ON push_deliveries(next_attempt_at);
