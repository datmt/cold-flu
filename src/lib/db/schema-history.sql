CREATE TABLE IF NOT EXISTS step_cache (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  response_status INTEGER,
  response_headers TEXT,
  response_body TEXT,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(step_id, cache_key)
);

CREATE TABLE IF NOT EXISTS load_tests (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  concurrency INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  completed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  load_test_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_curl TEXT,
  request_method TEXT,
  request_url TEXT,
  request_headers TEXT,
  request_body TEXT,
  response_status INTEGER,
  response_headers TEXT,
  response_body TEXT,
  from_cache INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER
);
