-- Add HTTP caching headers and error tracking to feeds for conditional GET
ALTER TABLE feeds ADD COLUMN etag TEXT NOT NULL DEFAULT '';
ALTER TABLE feeds ADD COLUMN last_modified TEXT NOT NULL DEFAULT '';
ALTER TABLE feeds ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0;

-- Record execution of this migration
INSERT OR IGNORE INTO migrations (migration_number, migration_name)
VALUES (003, '003-feed-caching');
