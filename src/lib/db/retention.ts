// History retention. Kept free of '@/' imports so checks/ can load it with plain node.
import type Database from 'better-sqlite3';

/** 0 means unlimited for every field. */
export interface RetentionSettings {
  maxRunsPerChain: number;
  maxLoadTestsPerChain: number;
  maxAgeDays: number;
  maxBodyBytes: number;
}

export const DEFAULT_RETENTION: RetentionSettings = {
  maxRunsPerChain: 500,
  maxLoadTestsPerChain: 10,
  maxAgeDays: 0,
  maxBodyBytes: 1_000_000,
};

const KEY_PREFIX = 'history_';

export function readRetention(configDb: Database.Database): RetentionSettings {
  const rows = configDb
    .prepare(`SELECT key, value FROM settings WHERE key LIKE '${KEY_PREFIX}%'`)
    .all() as { key: string; value: string }[];
  const out = { ...DEFAULT_RETENTION };
  for (const { key, value } of rows) {
    const field = key.slice(KEY_PREFIX.length) as keyof RetentionSettings;
    const n = Number(value);
    if (Object.hasOwn(out, field) && Number.isInteger(n) && n >= 0) out[field] = n;
  }
  return out;
}

export function writeRetention(configDb: Database.Database, s: RetentionSettings): void {
  const upsert = configDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  configDb.transaction(() => {
    for (const [field, value] of Object.entries(s)) upsert.run(KEY_PREFIX + field, String(value));
  })();
}

/** Cuts a body to maxBytes of UTF-8 (a split multi-byte char becomes U+FFFD). */
export function truncateBody(body: string, maxBytes: number): { body: string; truncated: boolean } {
  if (!maxBytes || body.length <= maxBytes / 4) return { body, truncated: false }; // ≤4 bytes/char: fast path
  const buf = Buffer.from(body);
  if (buf.length <= maxBytes) return { body, truncated: false };
  return { body: buf.subarray(0, maxBytes).toString(), truncated: true };
}

function deleteRuns(h: Database.Database, runIds: string[]): void {
  // Explicit run_steps delete: older history.db files may predate the cascading FK.
  const delSteps = h.prepare('DELETE FROM run_steps WHERE run_id = ?');
  const delRun = h.prepare('DELETE FROM runs WHERE id = ?');
  for (const id of runIds) {
    delSteps.run(id);
    delRun.run(id);
  }
}

/** Applies retention to one chain. Running runs/load tests are never touched. Returns runs deleted. */
export function pruneChainHistory(
  h: Database.Database,
  chainId: string,
  s: RetentionSettings,
  now = Date.now(),
): number {
  const cutoff = s.maxAgeDays ? now - s.maxAgeDays * 86_400_000 : 0;
  const pluck = (sql: string, ...args: unknown[]) => h.prepare(sql).pluck().all(...args) as string[];

  return h.transaction(() => {
    let deleted = 0;

    // Standalone runs: over the count limit or older than the cutoff.
    const runIds = new Set<string>();
    if (s.maxRunsPerChain) {
      pluck(
        `SELECT id FROM runs WHERE chain_id = ? AND load_test_id IS NULL AND status != 'running'
         ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
        chainId,
        s.maxRunsPerChain,
      ).forEach((id) => runIds.add(id));
    }
    if (cutoff) {
      pluck(
        `SELECT id FROM runs WHERE chain_id = ? AND load_test_id IS NULL AND status != 'running' AND started_at < ?`,
        chainId,
        cutoff,
      ).forEach((id) => runIds.add(id));
    }
    deleteRuns(h, [...runIds]);
    deleted += runIds.size;

    // Load tests go as a whole group: the test row plus all of its runs.
    // A cancelled test can still have runs draining, so check the runs too.
    const idle = `status != 'running' AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.load_test_id = load_tests.id AND r.status = 'running')`;
    const ltIds = new Set<string>();
    if (s.maxLoadTestsPerChain) {
      pluck(
        `SELECT id FROM load_tests WHERE chain_id = ? AND ${idle}
         ORDER BY started_at DESC LIMIT -1 OFFSET ?`,
        chainId,
        s.maxLoadTestsPerChain,
      ).forEach((id) => ltIds.add(id));
    }
    if (cutoff) {
      pluck(
        `SELECT id FROM load_tests WHERE chain_id = ? AND ${idle} AND started_at < ?`,
        chainId,
        cutoff,
      ).forEach((id) => ltIds.add(id));
    }
    for (const ltId of ltIds) {
      const ids = pluck('SELECT id FROM runs WHERE load_test_id = ?', ltId);
      deleteRuns(h, ids);
      deleted += ids.length;
      h.prepare('DELETE FROM load_tests WHERE id = ?').run(ltId);
    }

    return deleted;
  })();
}

/** Prunes every chain that has history, then VACUUMs. Returns runs deleted and file size change. */
export function compactHistory(h: Database.Database, s: RetentionSettings) {
  const size = () => {
    const pages = h.pragma('page_count', { simple: true }) as number;
    return pages * (h.pragma('page_size', { simple: true }) as number);
  };
  const bytesBefore = size();
  const chainIds = h
    .prepare('SELECT chain_id FROM runs UNION SELECT chain_id FROM load_tests')
    .pluck()
    .all() as string[];
  let deleted = 0;
  for (const id of chainIds) deleted += pruneChainHistory(h, id, s);
  h.exec('VACUUM');
  return { deleted, bytesBefore, bytesAfter: size() };
}
