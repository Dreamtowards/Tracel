-- Keep observation IDs/timestamps and state references; numeric values move to
-- bounded, lossless delta-coded blocks. GPU engine detail is intentionally retired.
ALTER TABLE system_samples ADD COLUMN numeric_encoded INTEGER NOT NULL DEFAULT 0;
CREATE TABLE gpu_adapters (
 id INTEGER PRIMARY KEY,
 identity TEXT NOT NULL,
 name TEXT NOT NULL,
 UNIQUE(identity,name)
);
CREATE TABLE numeric_blocks (
 first_id INTEGER PRIMARY KEY,
 last_id INTEGER NOT NULL CHECK(last_id >= first_id),
 payload BLOB NOT NULL
);
