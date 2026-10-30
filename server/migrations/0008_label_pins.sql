-- Keep existing custom labels visible when upgrading to the label-first drawer.
ALTER TABLE labels ADD COLUMN pinned INTEGER NOT NULL DEFAULT 1 CHECK(pinned IN (0,1));
UPDATE labels SET pinned=0 WHERE kind='system';
