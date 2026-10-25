-- Retire built-in categories without deleting mail or custom labels. Foreign keys
-- cascade only the retired labels' memberships, guidance and training examples.
DELETE FROM rules WHERE action='category';
DELETE FROM labels WHERE kind='system' AND id IN
 ('CATEGORY_PERSONAL','CATEGORY_PROMOTIONS','CATEGORY_SOCIAL','CATEGORY_UPDATES');
-- sorting_results.category remains as historical audit data; new rows use ''.
