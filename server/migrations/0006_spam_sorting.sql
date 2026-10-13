INSERT INTO sorting_memory(label_id,guidance) VALUES
 ('SPAM','Unsolicited scams, phishing, fraud and abusive junk. Promotions, newsletters, receipts and service notifications are legitimate unless my explicit corrections say otherwise. When uncertain, keep mail in the inbox.');
-- NULL means the older classifier did not assess spam.
ALTER TABLE sorting_results ADD COLUMN spam INTEGER CHECK(spam IN (0,1));
ALTER TABLE sorting_results ADD COLUMN spam_confidence REAL CHECK(spam_confidence BETWEEN 0 AND 1);
ALTER TABLE sorting_results ADD COLUMN spam_moved INTEGER CHECK(spam_moved IN (0,1));
