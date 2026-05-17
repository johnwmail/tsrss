-- Track cron execution history
CREATE TABLE IF NOT EXISTS cron_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL DEFAULT 'cron',
    feeds_checked INTEGER DEFAULT 0,
    articles_found INTEGER DEFAULT 0
);
