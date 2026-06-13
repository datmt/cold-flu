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
  type TEXT NOT NULL DEFAULT 'curl',
  curl_template TEXT NOT NULL DEFAULT '',
  transform_code TEXT NOT NULL DEFAULT '',
  cache_enabled INTEGER NOT NULL DEFAULT 0,
  cache_ttl INTEGER NOT NULL DEFAULT 3600,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS step_dependencies (
  step_id TEXT NOT NULL,
  depends_on_step_id TEXT NOT NULL,
  source_handle TEXT,
  PRIMARY KEY (step_id, depends_on_step_id),
  FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_step_id) REFERENCES steps(id) ON DELETE CASCADE
);
