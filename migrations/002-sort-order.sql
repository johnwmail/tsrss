-- Add sort_order to categories and feeds for drag-and-drop reordering
ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feeds ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Record execution of this migration
INSERT OR IGNORE INTO migrations (migration_number, migration_name)
VALUES (002, '002-sort-order');
