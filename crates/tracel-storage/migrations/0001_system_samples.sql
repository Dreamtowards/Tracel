-- Proposed SQLite schema; runner, WAL setup and production storage are deferred.
CREATE TABLE system_samples (
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL CHECK (end_ms > start_ms),
    metric TEXT NOT NULL,
    value REAL,
    source TEXT NOT NULL,
    quality TEXT NOT NULL CHECK (quality IN ('observed', 'missing', 'estimated')),
    PRIMARY KEY (start_ms, metric, source)
);
CREATE INDEX system_samples_end ON system_samples(end_ms);
