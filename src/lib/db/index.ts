import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

import { DEFAULT_TRANSFORM_CODE } from '@/lib/steps';
import type {
  Chain,
  ChainDetail,
  ChainExport,
  ChainExportStep,
  ChainRun,
  ChainSummary,
  ChainRunDetail,
  Dictionary,
  Environment,
  LoadTest,
  LoadTestStatus,
  RunStep,
  Step,
  StepDependency,
  StepType,
} from '@/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_DB_PATH = path.join(DATA_DIR, 'app.db');
const HISTORY_DB_PATH = path.join(DATA_DIR, 'history.db');
const CONFIG_SCHEMA_PATH = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql');
const HISTORY_SCHEMA_PATH = path.join(process.cwd(), 'src', 'lib', 'db', 'schema-history.sql');

const configAlterStatements = [
  "ALTER TABLE steps ADD COLUMN type TEXT NOT NULL DEFAULT 'curl'",
  "ALTER TABLE steps ADD COLUMN transform_code TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE steps ADD COLUMN position_x REAL NOT NULL DEFAULT 0",
  "ALTER TABLE steps ADD COLUMN position_y REAL NOT NULL DEFAULT 0",
  "ALTER TABLE environments ADD COLUMN functions TEXT NOT NULL DEFAULT ''",
];

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

type EnvironmentRow = {
  id: string;
  name: string;
  variables: string;
  functions: string;
  created_at: number;
  updated_at: number;
};

type ChainRow = Chain;

type ChainWithCountRow = Chain & {
  step_count: number;
};

type StepRow = {
  id: string;
  chain_id: string;
  name: string;
  order_index: number;
  type: StepType;
  curl_template: string;
  transform_code: string;
  cache_enabled: number;
  cache_ttl: number;
  position_x: number;
  position_y: number;
  created_at: number;
  updated_at: number;
};

type StepDependencyRow = StepDependency;

type ChainRunRow = {
  id: string;
  chain_id: string;
  load_test_id: string | null;
  status: ChainRun['status'];
  started_at: number;
  finished_at: number | null;
  error: string | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
};

type RunStepRow = {
  id: string;
  run_id: string;
  step_id: string;
  step_name: string;
  order_index: number;
  status: RunStep['status'];
  resolved_curl: string | null;
  request_method: string | null;
  request_url: string | null;
  request_headers: string | null;
  request_body: string | null;
  response_status: number | null;
  response_headers: string | null;
  response_body: string | null;
  from_cache: number;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
};

type LoadTestRow = {
  id: string;
  chain_id: string;
  total: number;
  concurrency: number;
  status: LoadTestStatus;
  completed: number;
  failed: number;
  started_at: number;
  finished_at: number | null;
};

let db!: Database.Database;
let historyDb!: Database.Database;

function initializeDatabases() {
  ensureDataDir();

  // Config database
  const configInstance = new Database(CONFIG_DB_PATH);
  configInstance.pragma('journal_mode = WAL');
  configInstance.pragma('foreign_keys = ON');

  const configSchema = fs.readFileSync(CONFIG_SCHEMA_PATH, 'utf8');
  configInstance.exec(configSchema);

  for (const sql of configAlterStatements) {
    try {
      configInstance.exec(sql);
    } catch {}
  }

  configInstance.exec(`
    CREATE TABLE IF NOT EXISTS step_dependencies (
      step_id TEXT NOT NULL,
      depends_on_step_id TEXT NOT NULL,
      source_handle TEXT,
      PRIMARY KEY (step_id, depends_on_step_id),
      FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on_step_id) REFERENCES steps(id) ON DELETE CASCADE
    )
  `);

  // History database
  const historyInstance = new Database(HISTORY_DB_PATH);
  historyInstance.pragma('journal_mode = WAL');
  // Wait up to 5 s when writers contend instead of failing immediately with SQLITE_BUSY
  historyInstance.pragma('busy_timeout = 5000');
  historyInstance.pragma('foreign_keys = OFF');

  const historySchema = fs.readFileSync(HISTORY_SCHEMA_PATH, 'utf8');
  historyInstance.exec(historySchema);

  // Indexes that make JOIN-heavy queries fast as history grows under load tests
  // Composite (chain_id, started_at) lets ORDER BY + LIMIT skip a sort pass
  historyInstance.exec('CREATE INDEX IF NOT EXISTS idx_runs_chain_started ON runs(chain_id, started_at DESC)');
  historyInstance.exec('CREATE INDEX IF NOT EXISTS idx_runs_load_test_id ON runs(load_test_id)');
  historyInstance.exec('CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id)');
  historyInstance.exec('CREATE INDEX IF NOT EXISTS idx_load_tests_chain_id ON load_tests(chain_id)');

  // Migrate load_tests if it has a stale FK to chains (chains lives in configDb, not historyDb)
  const loadTestFks = historyInstance.pragma('foreign_key_list(load_tests)') as { table: string }[];
  if (loadTestFks.some((fk) => fk.table === 'chains')) {
    historyInstance.exec('CREATE TABLE load_tests_new (id TEXT PRIMARY KEY, chain_id TEXT NOT NULL, total INTEGER NOT NULL, concurrency INTEGER NOT NULL, status TEXT NOT NULL DEFAULT \'running\', completed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, started_at INTEGER NOT NULL, finished_at INTEGER)');
    historyInstance.exec('INSERT OR IGNORE INTO load_tests_new SELECT id, chain_id, total, concurrency, status, completed, failed, started_at, finished_at FROM load_tests');
    historyInstance.exec('DROP TABLE load_tests');
    historyInstance.exec('ALTER TABLE load_tests_new RENAME TO load_tests');
  }

  historyInstance.pragma('foreign_keys = ON');

  db = configInstance;
  historyDb = historyInstance;
}

initializeDatabases();

export default db;
export { historyDb };

function normalizeStepType(value?: string | null): StepType {
  if (value === 'transform') return 'transform';
  if (value === 'condition') return 'condition';
  return 'curl';
}

function normalizeCacheEnabled(value?: number | boolean | null): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value === 1 ? 1 : 0;
  }

  return 0;
}

function mapEnvironment(row: EnvironmentRow): Environment {
  return {
    id: row.id,
    name: row.name,
    variables: JSON.parse(row.variables || '{}') as Dictionary,
    functions: row.functions ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapStep(row: StepRow, depends_on: string[] = [], dependency_handles: Record<string, string | null> = {}): Step {
  return {
    id: row.id,
    chain_id: row.chain_id,
    name: row.name,
    order_index: row.order_index,
    type: normalizeStepType(row.type),
    curl_template: row.curl_template,
    transform_code: row.transform_code ?? '',
    cache_enabled: Number(row.cache_enabled ?? 0),
    cache_ttl: row.cache_ttl,
    position_x: Number(row.position_x ?? 0),
    position_y: Number(row.position_y ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    depends_on,
    dependency_handles,
  };
}

function mapRun(row: ChainRunRow): ChainRun {
  return {
    id: row.id,
    chain_id: row.chain_id,
    load_test_id: row.load_test_id ?? null,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    error: row.error,
    total_steps: Number(row.total_steps ?? 0),
    completed_steps: Number(row.completed_steps ?? 0),
    failed_steps: Number(row.failed_steps ?? 0),
  };
}

function mapRunStep(row: RunStepRow): RunStep {
  return {
    id: row.id,
    run_id: row.run_id,
    step_id: row.step_id,
    step_name: row.step_name,
    order_index: row.order_index,
    wave_index: row.order_index,
    status: row.status,
    resolved_curl: row.resolved_curl,
    request_method: row.request_method,
    request_url: row.request_url,
    request_headers: row.request_headers,
    request_body: row.request_body,
    response_status: row.response_status,
    response_headers: row.response_headers,
    response_body: row.response_body,
    from_cache: Boolean(row.from_cache),
    error: row.error,
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

function mapLoadTest(row: LoadTestRow): LoadTest {
  return {
    id: row.id,
    chain_id: row.chain_id,
    total: row.total,
    concurrency: row.concurrency,
    status: row.status,
    completed: row.completed,
    failed: row.failed,
    started_at: row.started_at,
    finished_at: row.finished_at ?? null,
  };
}

function touchChain(chainId: string, updatedAt = Date.now()) {
  db.prepare('UPDATE chains SET updated_at = ? WHERE id = ?').run(updatedAt, chainId);
}

function getStepRow(stepId: string): StepRow | null {
  const row = db.prepare('SELECT * FROM steps WHERE id = ?').get(stepId) as StepRow | undefined;
  return row ?? null;
}

function getChainStepRows(chainId: string): StepRow[] {
  return db
    .prepare('SELECT * FROM steps WHERE chain_id = ? ORDER BY order_index, created_at')
    .all(chainId) as StepRow[];
}

function getChainStepIds(chainId: string): string[] {
  return getChainStepRows(chainId).map((step) => step.id);
}

function loadDependenciesForStepIds(stepIds: string[]): StepDependencyRow[] {
  if (stepIds.length === 0) {
    return [];
  }

  const placeholders = stepIds.map(() => '?').join(',');
  return db
    .prepare(`SELECT step_id, depends_on_step_id, source_handle FROM step_dependencies WHERE step_id IN (${placeholders}) ORDER BY step_id, depends_on_step_id`)
    .all(...stepIds) as StepDependencyRow[];
}

function loadAllChainDependencies(chainId: string): StepDependencyRow[] {
  const stepIds = getChainStepIds(chainId);

  if (stepIds.length === 0) {
    return [];
  }

  const placeholders = stepIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT step_id, depends_on_step_id, source_handle FROM step_dependencies WHERE step_id IN (${placeholders}) OR depends_on_step_id IN (${placeholders})`,
    )
    .all(...stepIds, ...stepIds) as StepDependencyRow[];
}

function hydrateSteps(rows: StepRow[]): Step[] {
  const stepIds = rows.map((row) => row.id);
  const dependencies = loadDependenciesForStepIds(stepIds);
  const dependsOnMap = new Map<string, string[]>();
  const handlesMap = new Map<string, Record<string, string | null>>();

  for (const row of rows) {
    dependsOnMap.set(row.id, []);
    handlesMap.set(row.id, {});
  }

  for (const dependency of dependencies) {
    dependsOnMap.get(dependency.step_id)?.push(dependency.depends_on_step_id);
    const handles = handlesMap.get(dependency.step_id);
    if (handles) {
      handles[dependency.depends_on_step_id] = dependency.source_handle ?? null;
    }
  }

  return rows.map((row) =>
    mapStep(row, dependsOnMap.get(row.id) ?? [], handlesMap.get(row.id) ?? {}),
  );
}

function assertAcyclic(stepIds: string[], dependencies: StepDependencyRow[]) {
  const dependsOnMap = new Map<string, string[]>();

  for (const stepId of stepIds) {
    dependsOnMap.set(stepId, []);
  }

  for (const dependency of dependencies) {
    if (dependsOnMap.has(dependency.step_id)) {
      dependsOnMap.get(dependency.step_id)?.push(dependency.depends_on_step_id);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (stepId: string) => {
    if (visited.has(stepId)) {
      return;
    }

    if (visiting.has(stepId)) {
      throw new Error('Step dependencies must form a DAG');
    }

    visiting.add(stepId);

    for (const dependencyId of dependsOnMap.get(stepId) ?? []) {
      if (dependsOnMap.has(dependencyId)) {
        visit(dependencyId);
      }
    }

    visiting.delete(stepId);
    visited.add(stepId);
  };

  for (const stepId of stepIds) {
    visit(stepId);
  }
}

function rebalanceStepOrder(chainId: string) {
  const rows = db
    .prepare('SELECT id FROM steps WHERE chain_id = ? ORDER BY order_index, created_at')
    .all(chainId) as Array<{ id: string }>;
  const update = db.prepare('UPDATE steps SET order_index = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();

  rows.forEach((row, index) => {
    update.run(index, now, row.id);
  });

  touchChain(chainId, now);
}

export function listEnvironments(): Environment[] {
  const rows = db
    .prepare('SELECT * FROM environments ORDER BY updated_at DESC, created_at DESC')
    .all() as EnvironmentRow[];
  return rows.map(mapEnvironment);
}

export function getEnvironment(id: string): Environment | null {
  const row = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as EnvironmentRow | undefined;
  return row ? mapEnvironment(row) : null;
}

export function createEnvironment(input: {
  name: string;
  variables?: Dictionary;
  functions?: string;
}): Environment {
  const id = uuid();
  const now = Date.now();

  db.prepare(
    'INSERT INTO environments (id, name, variables, functions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, input.name, JSON.stringify(input.variables ?? {}), input.functions ?? '', now, now);

  return getEnvironment(id)!;
}

export function updateEnvironment(
  id: string,
  input: { name?: string; variables?: Dictionary; functions?: string },
): Environment | null {
  const existing = getEnvironment(id);

  if (!existing) {
    return null;
  }

  const now = Date.now();
  db.prepare('UPDATE environments SET name = ?, variables = ?, functions = ?, updated_at = ? WHERE id = ?').run(
    input.name ?? existing.name,
    JSON.stringify(input.variables ?? existing.variables),
    input.functions ?? existing.functions,
    now,
    id,
  );

  return getEnvironment(id);
}

export function deleteEnvironment(id: string): boolean {
  const result = db.prepare('DELETE FROM environments WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getGlobalFunctions(): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('global_functions') as
    | { value: string }
    | undefined;
  return row?.value ?? '';
}

export function setGlobalFunctions(src: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('global_functions', src);
}

export function listChains(): ChainSummary[] {
  return db
    .prepare(
      `SELECT c.*, COUNT(s.id) AS step_count
       FROM chains c
       LEFT JOIN steps s ON s.chain_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC, c.created_at DESC`,
    )
    .all() as ChainWithCountRow[];
}

export function getChain(id: string): ChainDetail | null {
  const chain = db.prepare('SELECT * FROM chains WHERE id = ?').get(id) as ChainRow | undefined;

  if (!chain) {
    return null;
  }

  const steps = hydrateSteps(getChainStepRows(id));
  const environment = chain.environment_id ? getEnvironment(chain.environment_id) : null;

  return {
    ...chain,
    steps,
    environment,
  };
}

export function createChain(input: {
  name: string;
  description?: string;
  environment_id?: string | null;
}): ChainDetail {
  const id = uuid();
  const now = Date.now();

  db.prepare(
    'INSERT INTO chains (id, name, description, environment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, input.name, input.description ?? '', input.environment_id ?? null, now, now);

  return getChain(id)!;
}

export function updateChain(
  id: string,
  input: { name?: string; description?: string; environment_id?: string | null },
): ChainDetail | null {
  const existing = db.prepare('SELECT * FROM chains WHERE id = ?').get(id) as ChainRow | undefined;

  if (!existing) {
    return null;
  }

  const now = Date.now();
  db.prepare(
    'UPDATE chains SET name = ?, description = ?, environment_id = ?, updated_at = ? WHERE id = ?',
  ).run(
    input.name ?? existing.name,
    input.description ?? existing.description,
    input.environment_id === undefined ? existing.environment_id : input.environment_id,
    now,
    id,
  );

  return getChain(id);
}

export function deleteChain(id: string): boolean {
  const result = db.prepare('DELETE FROM chains WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getStep(id: string): Step | null {
  const row = getStepRow(id);

  if (!row) {
    return null;
  }

  const depList = listStepDependencies(id);
  const depends_on = depList.map((d) => d.depends_on_step_id);
  const dependency_handles: Record<string, string | null> = {};
  for (const d of depList) {
    dependency_handles[d.depends_on_step_id] = d.source_handle ?? null;
  }
  return mapStep(row, depends_on, dependency_handles);
}

export function createStep(input: {
  chain_id: string;
  name: string;
  order_index?: number;
  type?: StepType;
  curl_template?: string;
  transform_code?: string;
  cache_enabled?: number | boolean;
  cache_ttl?: number;
  position_x?: number;
  position_y?: number;
}): Step {
  const chain = db.prepare('SELECT id FROM chains WHERE id = ?').get(input.chain_id) as { id: string } | undefined;

  if (!chain) {
    throw new Error('Chain not found');
  }

  const id = uuid();
  const now = Date.now();
  const existingCount = db
    .prepare('SELECT COUNT(*) AS count FROM steps WHERE chain_id = ?')
    .get(input.chain_id) as { count: number };
  const orderIndex = input.order_index ?? existingCount.count;
  const type = normalizeStepType(input.type);
  const transformCode =
    input.transform_code ?? (type === 'transform' ? DEFAULT_TRANSFORM_CODE : '');
  const positionX = input.position_x ?? existingCount.count * 220;
  const positionY = input.position_y ?? 100;

  db.transaction(() => {
    db.prepare(
      'UPDATE steps SET order_index = order_index + 1, updated_at = ? WHERE chain_id = ? AND order_index >= ?',
    ).run(now, input.chain_id, orderIndex);

    db.prepare(
      `INSERT INTO steps (
        id, chain_id, name, order_index, type, curl_template, transform_code,
        cache_enabled, cache_ttl, position_x, position_y, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.chain_id,
      input.name,
      orderIndex,
      type,
      input.curl_template ?? '',
      transformCode,
      normalizeCacheEnabled(input.cache_enabled),
      input.cache_ttl ?? 3600,
      positionX,
      positionY,
      now,
      now,
    );

    touchChain(input.chain_id, now);
  })();

  return getStep(id)!;
}

export function updateStep(
  id: string,
  input: {
    name?: string;
    curl_template?: string;
    transform_code?: string;
    type?: StepType;
    cache_enabled?: number | boolean;
    cache_ttl?: number;
    position_x?: number;
    position_y?: number;
  },
): Step | null {
  const existing = getStepRow(id);

  if (!existing) {
    return null;
  }

  const nextType = normalizeStepType(input.type ?? existing.type);
  const now = Date.now();
  const transformCode =
    input.transform_code ??
    existing.transform_code ??
    (nextType === 'transform' ? DEFAULT_TRANSFORM_CODE : '');

  db.prepare(
    `UPDATE steps
     SET name = ?,
         curl_template = ?,
         transform_code = ?,
         type = ?,
         cache_enabled = ?,
         cache_ttl = ?,
         position_x = ?,
         position_y = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name ?? existing.name,
    input.curl_template ?? existing.curl_template,
    transformCode,
    nextType,
    input.cache_enabled === undefined
      ? normalizeCacheEnabled(existing.cache_enabled)
      : normalizeCacheEnabled(input.cache_enabled),
    input.cache_ttl ?? existing.cache_ttl,
    input.position_x ?? Number(existing.position_x ?? 0),
    input.position_y ?? Number(existing.position_y ?? 0),
    now,
    id,
  );

  touchChain(existing.chain_id, now);
  return getStep(id);
}

export function deleteStep(id: string): boolean {
  const existing = getStepRow(id);

  if (!existing) {
    return false;
  }

  db.transaction(() => {
    db.prepare('DELETE FROM step_dependencies WHERE step_id = ? OR depends_on_step_id = ?').run(id, id);
    historyDb.prepare('DELETE FROM step_cache WHERE step_id = ?').run(id);
    db.prepare('DELETE FROM steps WHERE id = ?').run(id);
    rebalanceStepOrder(existing.chain_id);
  })();

  return true;
}

export function clearStepCache(stepId: string): boolean {
  const result = historyDb.prepare('DELETE FROM step_cache WHERE step_id = ?').run(stepId);
  return result.changes > 0;
}

export function listStepDependencies(stepId: string): StepDependency[] {
  return db
    .prepare(
      'SELECT step_id, depends_on_step_id, source_handle FROM step_dependencies WHERE step_id = ? ORDER BY depends_on_step_id',
    )
    .all(stepId) as StepDependency[];
}

export function addStepDependency(stepId: string, dependsOnStepId: string, sourceHandle?: string | null): StepDependency[] {
  const step = getStepRow(stepId);
  const dependency = getStepRow(dependsOnStepId);

  if (!step || !dependency) {
    throw new Error('Step not found');
  }

  if (step.chain_id !== dependency.chain_id) {
    throw new Error('Dependencies must belong to the same chain');
  }

  if (stepId === dependsOnStepId) {
    throw new Error('A step cannot depend on itself');
  }

  const allDependencies = loadAllChainDependencies(step.chain_id);
  assertAcyclic(getChainStepIds(step.chain_id), [
    ...allDependencies,
    { step_id: stepId, depends_on_step_id: dependsOnStepId },
  ]);

  db.transaction(() => {
    db.prepare(
      'INSERT OR REPLACE INTO step_dependencies (step_id, depends_on_step_id, source_handle) VALUES (?, ?, ?)',
    ).run(stepId, dependsOnStepId, sourceHandle ?? null);
    touchChain(step.chain_id);
  })();

  return listStepDependencies(stepId);
}

export function removeStepDependency(stepId: string, dependsOnStepId: string): StepDependency[] {
  const step = getStepRow(stepId);

  db.prepare('DELETE FROM step_dependencies WHERE step_id = ? AND depends_on_step_id = ?').run(
    stepId,
    dependsOnStepId,
  );

  if (step) {
    touchChain(step.chain_id);
  }

  return listStepDependencies(stepId);
}

export function saveChainGraph(
  chainId: string,
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null }>,
) {
  const stepIds = getChainStepIds(chainId);
  const stepIdSet = new Set(stepIds);

  for (const node of nodes) {
    if (!stepIdSet.has(node.id)) {
      throw new Error('Graph contains an unknown step');
    }
  }

  const dependencyRows = edges.map((edge) => {
    if (!stepIdSet.has(edge.source) || !stepIdSet.has(edge.target)) {
      throw new Error('Graph contains invalid dependency edges');
    }

    if (edge.source === edge.target) {
      throw new Error('A step cannot depend on itself');
    }

    return {
      step_id: edge.target,
      depends_on_step_id: edge.source,
      source_handle: edge.sourceHandle ?? null,
    } satisfies StepDependencyRow;
  });

  assertAcyclic(stepIds, dependencyRows);

  const now = Date.now();
  db.transaction(() => {
    for (const node of nodes) {
      db.prepare(
        'UPDATE steps SET position_x = ?, position_y = ?, updated_at = ? WHERE id = ? AND chain_id = ?',
      ).run(node.position.x, node.position.y, now, node.id, chainId);
    }

    if (stepIds.length > 0) {
      const placeholders = stepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM step_dependencies WHERE step_id IN (${placeholders})`).run(...stepIds);
    }

    for (const dependency of dependencyRows) {
      db.prepare(
        'INSERT OR IGNORE INTO step_dependencies (step_id, depends_on_step_id, source_handle) VALUES (?, ?, ?)',
      ).run(dependency.step_id, dependency.depends_on_step_id, dependency.source_handle ?? null);
    }

    touchChain(chainId, now);
  })();
}

export function listRuns(chainId: string, limit = 50, offset = 0): ChainRun[] {
  // Paginate runs first (inner subquery uses idx_runs_chain_started to skip a sort),
  // then aggregate run_steps only for those rows. Without this, GROUP BY forces SQLite
  // to join and aggregate every run before LIMIT is applied.
  const rows = historyDb
    .prepare(
      `SELECT r.*,
              SUM(CASE WHEN rs.status != 'stale' THEN 1 ELSE 0 END) AS total_steps,
              SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) AS completed_steps,
              SUM(CASE WHEN rs.status = 'failed' THEN 1 ELSE 0 END) AS failed_steps
       FROM (
         SELECT * FROM runs
         WHERE chain_id = ?
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?
       ) r
       LEFT JOIN run_steps rs ON rs.run_id = r.id
       GROUP BY r.id
       ORDER BY r.started_at DESC`,
    )
    .all(chainId, limit, offset) as ChainRunRow[];

  return rows.map(mapRun);
}

export const listRunsForChain = listRuns;

export function getRun(id: string): ChainRunDetail | null {
  const runRow = historyDb
    .prepare(
      `SELECT r.*,
              SUM(CASE WHEN rs.status != 'stale' THEN 1 ELSE 0 END) AS total_steps,
              SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) AS completed_steps,
              SUM(CASE WHEN rs.status = 'failed' THEN 1 ELSE 0 END) AS failed_steps
       FROM runs r
       LEFT JOIN run_steps rs ON rs.run_id = r.id
       WHERE r.id = ?
       GROUP BY r.id`,
    )
    .get(id) as ChainRunRow | undefined;

  if (!runRow) {
    return null;
  }

  const steps = historyDb
    .prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY order_index ASC, started_at ASC, step_name ASC')
    .all(id) as RunStepRow[];

  return {
    ...mapRun(runRow),
    steps: steps.map(mapRunStep),
  };
}

export function exportChain(id: string): ChainExport | null {
  const detail = getChain(id);

  if (!detail) {
    return null;
  }

  return {
    version: 1,
    name: detail.name,
    description: detail.description,
    steps: detail.steps.map(
      (step): ChainExportStep => ({
        ref: step.id,
        name: step.name,
        type: step.type,
        curl_template: step.curl_template,
        transform_code: step.transform_code,
        cache_enabled: step.cache_enabled,
        cache_ttl: step.cache_ttl,
        position_x: step.position_x,
        position_y: step.position_y,
        depends_on: step.depends_on ?? [],
      }),
    ),
  };
}

export function importChain(payload: ChainExport): ChainDetail {
  const newChain = createChain({ name: payload.name, description: payload.description });

  // Map old ref -> new step id so we can wire up dependencies.
  const refToId = new Map<string, string>();

  for (const s of payload.steps) {
    const created = createStep({
      chain_id: newChain.id,
      name: s.name,
      type: s.type,
      curl_template: s.curl_template,
      transform_code: s.transform_code,
      cache_enabled: s.cache_enabled,
      cache_ttl: s.cache_ttl,
      position_x: s.position_x,
      position_y: s.position_y,
    });
    refToId.set(s.ref, created.id);
  }

  // Add dependencies now that all steps exist.
  db.transaction(() => {
    for (const s of payload.steps) {
      const stepId = refToId.get(s.ref);
      if (!stepId) continue;

      for (const depRef of s.depends_on) {
        const depId = refToId.get(depRef);
        if (depId) {
          db.prepare('INSERT OR IGNORE INTO step_dependencies (step_id, depends_on_step_id) VALUES (?, ?)').run(
            stepId,
            depId,
          );
        }
      }
    }
  })();

  return getChain(newChain.id)!;
}

export function duplicateChain(id: string): ChainDetail | null {
  const exported = exportChain(id);

  if (!exported) {
    return null;
  }

  return importChain({ ...exported, name: `Copy of ${exported.name}` });
}

// ------ Load tests
// ------------------------------

export function createLoadTest(chainId: string, total: number, concurrency: number): LoadTest {
  const id = uuid();
  const now = Date.now();
  historyDb.prepare(
    'INSERT INTO load_tests (id, chain_id, total, concurrency, status, completed, failed, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, chainId, total, concurrency, 'running', 0, 0, now);
  return getLoadTest(id)!;
}

export function getLoadTest(id: string): LoadTest | null {
  const row = historyDb.prepare('SELECT * FROM load_tests WHERE id = ?').get(id) as LoadTestRow | undefined;
  return row ? mapLoadTest(row) : null;
}

export function incrementLoadTestProgress(id: string, outcome: 'completed' | 'failed'): void {
  const col = outcome === 'completed' ? 'completed' : 'failed';
  historyDb.prepare(`UPDATE load_tests SET ${col} = ${col} + 1 WHERE id = ?`).run(id);
}

export function finalizeLoadTest(id: string): void {
  const row = historyDb.prepare('SELECT * FROM load_tests WHERE id = ?').get(id) as LoadTestRow | undefined;
  if (!row) return;
  const status: LoadTestStatus = row.failed > 0 ? 'failed' : 'completed';
  historyDb.prepare('UPDATE load_tests SET status = ?, finished_at = ? WHERE id = ?').run(
    status,
    Date.now(),
    id,
  );
}

export function listLoadTestRuns(loadTestId: string, limit = 100, offset = 0): ChainRun[] {
  const rows = historyDb
    .prepare(
      `SELECT r.*,
              SUM(CASE WHEN rs.status != 'stale' THEN 1 ELSE 0 END) AS total_steps,
              SUM(CASE WHEN rs.status = 'completed' THEN 1 ELSE 0 END) AS completed_steps,
              SUM(CASE WHEN rs.status = 'failed' THEN 1 ELSE 0 END) AS failed_steps
       FROM (
         SELECT * FROM runs
         WHERE load_test_id = ?
         ORDER BY started_at DESC
         LIMIT ? OFFSET ?
       ) r
       LEFT JOIN run_steps rs ON rs.run_id = r.id
       GROUP BY r.id
       ORDER BY r.started_at DESC`,
    )
    .all(loadTestId, limit, offset) as ChainRunRow[];
  return rows.map(mapRun);
}

export function cancelLoadTest(id: string): boolean {
  const result = historyDb
    .prepare("UPDATE load_tests SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'running'")
    .run(Date.now(), id);
  return result.changes > 0;
}

export function listLoadTestsForChain(chainId: string): LoadTest[] {
  const rows = historyDb
    .prepare('SELECT * FROM load_tests WHERE chain_id = ? ORDER BY started_at DESC')
    .all(chainId) as LoadTestRow[];
  return rows.map(mapLoadTest);
}
