CREATE TABLE sorting_memory (
    label_id TEXT PRIMARY KEY REFERENCES labels(id) ON DELETE CASCADE,
    guidance TEXT NOT NULL DEFAULT ''
);
INSERT INTO sorting_memory(label_id,guidance) VALUES
 ('CATEGORY_PERSONAL','Personal conversations and mail requiring a direct response or action from me.'),
 ('CATEGORY_PROMOTIONS','Marketing, offers, sales, newsletters and promotional mailing lists.'),
 ('CATEGORY_SOCIAL','Social network activity and community notifications.'),
 ('CATEGORY_UPDATES','Receipts, invoices, orders, shipping, account security and automated service updates.');
CREATE TABLE sorting_examples (
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    included INTEGER NOT NULL CHECK(included IN (0,1)),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(label_id,message_id)
);
CREATE INDEX sorting_examples_recent ON sorting_examples(label_id,updated_at DESC);
CREATE TABLE sorting_results (
    message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    category TEXT NOT NULL,
    label_ids TEXT NOT NULL,
    classified_at INTEGER NOT NULL
);
