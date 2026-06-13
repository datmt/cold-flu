CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '{}',
  functions TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  curl_template TEXT NOT NULL DEFAULT '',
  cache_enabled INTEGER NOT NULL DEFAULT 0,
  cache_ttl INTEGER NOT NULL DEFAULT 3600,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

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
  chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
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
  load_test_id TEXT REFERENCES load_tests(id) ON DELETE SET NULL,
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
