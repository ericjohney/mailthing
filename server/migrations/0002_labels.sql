-- Mailbox state moves from per-message columns to Gmail-style system labels; archiving
-- removes INBOX. Existing messages, labels and filters are converted in place.

-- Rebuilding `labels` cascades a delete through message_labels, so keep its rows aside.
CREATE TABLE message_labels_backup AS SELECT message_id,label_id FROM message_labels;
CREATE TABLE labels_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#2a6b53',
    kind TEXT NOT NULL DEFAULT 'user' CHECK(kind IN ('system','user'))
);
INSERT INTO labels_new(id,name,color,kind) VALUES
    ('INBOX','Inbox','#000000','system'),
    ('SENT','Sent','#000000','system'),
    ('SPAM','Spam','#000000','system'),
    ('TRASH','Trash','#000000','system'),
    ('UNREAD','Unread','#000000','system'),
    ('STARRED','Starred','#000000','system'),
    ('IMPORTANT','Important','#000000','system'),
    ('SNOOZED','Snoozed','#000000','system'),
    ('CATEGORY_PERSONAL','Primary','#000000','system'),
    ('CATEGORY_PROMOTIONS','Promotions','#000000','system'),
    ('CATEGORY_SOCIAL','Social','#000000','system'),
    ('CATEGORY_UPDATES','Updates','#000000','system');
-- Names are now unique case-insensitively, including system names; suffix collisions.
INSERT INTO labels_new(id,name,color,kind)
SELECT id,
       CASE WHEN rank>1 OR EXISTS(SELECT 1 FROM labels_new s WHERE s.name=old.name)
            THEN name||' ('||substr(id,1,8)||')' ELSE name END,
       color,'user'
FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY lower(name) ORDER BY rowid) AS rank FROM labels) old;
DROP TABLE labels;
ALTER TABLE labels_new RENAME TO labels;
INSERT INTO message_labels(message_id,label_id) SELECT message_id,label_id FROM message_labels_backup;
DROP TABLE message_labels_backup;
CREATE INDEX IF NOT EXISTS message_labels_label ON message_labels(label_id,message_id);

-- A message still snoozed waits under SNOOZED instead of INBOX.
INSERT OR IGNORE INTO message_labels(message_id,label_id)
SELECT id,
       CASE WHEN snoozed_until > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)
            THEN 'SNOOZED' ELSE 'INBOX' END
FROM messages WHERE folder='inbox';
INSERT OR IGNORE INTO message_labels(message_id,label_id)
SELECT id,upper(folder) FROM messages WHERE folder IN ('spam','trash');
INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT id,'SENT' FROM messages WHERE is_sent=1;
INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT id,'UNREAD' FROM messages WHERE is_read=0;
INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT id,'STARRED' FROM messages WHERE starred=1;
INSERT OR IGNORE INTO message_labels(message_id,label_id) SELECT id,'IMPORTANT' FROM messages WHERE important=1;
-- Sent mail carries no category.
INSERT OR IGNORE INTO message_labels(message_id,label_id)
SELECT id,'CATEGORY_'||CASE category WHEN 'primary' THEN 'PERSONAL' ELSE upper(category) END
FROM messages WHERE is_sent=0 AND category IN ('primary','promotions','social','updates');
UPDATE rules
SET value='CATEGORY_'||CASE value WHEN 'primary' THEN 'PERSONAL' ELSE upper(value) END
WHERE action='category' AND value IN ('primary','promotions','social','updates');

DROP INDEX IF EXISTS messages_folder;
DROP INDEX IF EXISTS messages_sent;
ALTER TABLE messages DROP COLUMN is_read;
ALTER TABLE messages DROP COLUMN starred;
ALTER TABLE messages DROP COLUMN important;
ALTER TABLE messages DROP COLUMN is_sent;
ALTER TABLE messages DROP COLUMN folder;
ALTER TABLE messages DROP COLUMN category;
CREATE INDEX IF NOT EXISTS messages_received ON messages(received_at DESC);
