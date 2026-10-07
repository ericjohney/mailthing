-- Mailbox state supplied with an imported message (JSON ImportState); NULL for received mail.
ALTER TABLE jobs ADD COLUMN import_state TEXT;
