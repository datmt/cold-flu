// Run: node checks/retention.check.mjs  (Node >= 23 strips TS types on import)
import assert from 'node:assert/strict';
import fs from 'node:fs';

import Database from 'better-sqlite3';

import { compactHistory, pruneChainHistory, readRetention, truncateBody, writeRetention } from '../src/lib/db/retention.ts';

const h = new Database(':memory:');
h.exec(fs.readFileSync(new URL('../src/lib/db/schema-history.sql', import.meta.url), 'utf8'));

const N = 5;
const s = { maxRunsPerChain: N, maxLoadTestsPerChain: 1, maxAgeDays: 0, maxBodyBytes: 10 };
const addRun = (id, chain, startedAt, extra = {}) => {
  h.prepare('INSERT INTO runs (id, chain_id, load_test_id, status, started_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, chain, extra.lt ?? null, extra.status ?? 'completed', startedAt);
  h.prepare("INSERT INTO run_steps (id, run_id, step_id, step_name, order_index) VALUES (?, ?, 's', 's', 0)")
    .run(`${id}-step`, id);
};
const count = (sql, ...a) => h.prepare(sql).pluck().get(...a);

// N+10 finished runs → newest N remain, with their steps; other chains untouched.
for (let i = 0; i < N + 10; i++) addRun(`a${i}`, 'A', 1000 + i);
addRun('a-running', 'A', 1, { status: 'running' });            // oldest, but still running: never pruned
for (let i = 0; i < 3; i++) addRun(`b${i}`, 'B', i);
assert.equal(pruneChainHistory(h, 'A', s), 10);
assert.deepEqual(
  h.prepare("SELECT id FROM runs WHERE chain_id = 'A' AND status = 'completed' ORDER BY started_at").pluck().all(),
  Array.from({ length: N }, (_, i) => `a${i + 10}`),
);
assert.equal(count("SELECT COUNT(*) FROM runs WHERE id = 'a-running'"), 1);
assert.equal(count("SELECT COUNT(*) FROM run_steps WHERE run_id NOT IN (SELECT id FROM runs)"), 0);
assert.equal(count("SELECT COUNT(*) FROM runs WHERE chain_id = 'B'"), 3);

// Load tests: pruned as whole groups, and their runs don't count toward maxRunsPerChain.
for (const [lt, t] of [['lt-old', 10], ['lt-new', 20]]) {
  h.prepare("INSERT INTO load_tests (id, chain_id, total, concurrency, status, started_at) VALUES (?, 'A', 3, 1, 'completed', ?)").run(lt, t);
  for (let i = 0; i < 3; i++) addRun(`${lt}-${i}`, 'A', t, { lt });
}
pruneChainHistory(h, 'A', s);
assert.equal(count("SELECT COUNT(*) FROM load_tests WHERE id = 'lt-old'"), 0);
assert.equal(count("SELECT COUNT(*) FROM runs WHERE load_test_id = 'lt-old'"), 0);
assert.equal(count("SELECT COUNT(*) FROM runs WHERE load_test_id = 'lt-new'"), 3);
assert.equal(count("SELECT COUNT(*) FROM runs WHERE chain_id = 'A' AND load_test_id IS NULL AND status = 'completed'"), N);

// A cancelled load test with runs still draining is kept until they finish.
h.prepare("INSERT INTO load_tests (id, chain_id, total, concurrency, status, started_at) VALUES ('lt-cx', 'A', 1, 1, 'cancelled', 30)").run();
addRun('lt-cx-0', 'A', 30, { lt: 'lt-cx', status: 'running' });
pruneChainHistory(h, 'A', s); // lt-cx is newest, so lt-new is the one over the limit
pruneChainHistory(h, 'A', { ...s, maxLoadTestsPerChain: 0, maxRunsPerChain: 0, maxAgeDays: 1 }, 1000 + 86_400_000); // cutoff 1000: only load tests are older
assert.equal(count("SELECT COUNT(*) FROM runs WHERE id = 'lt-cx-0'"), 1);
h.prepare("UPDATE runs SET status = 'completed' WHERE id = 'lt-cx-0'").run();

// Max age: everything older than the cutoff goes, count limit off.
pruneChainHistory(h, 'A', { ...s, maxRunsPerChain: 0, maxLoadTestsPerChain: 0, maxAgeDays: 1 }, 1012 + 86_400_000);
assert.equal(count("SELECT COUNT(*) FROM runs WHERE chain_id = 'A' AND status = 'completed'"), 3); // a10, a11 (< 1012) gone
assert.equal(count("SELECT COUNT(*) FROM load_tests"), 0);

// Compact prunes every chain and vacuums.
const r = compactHistory(h, { ...s, maxRunsPerChain: 1 });
assert.equal(count("SELECT COUNT(*) FROM runs WHERE chain_id = 'B'"), 1);
assert.ok(r.deleted >= 3 && r.bytesAfter > 0);

// Body truncation.
assert.deepEqual(truncateBody('short', 10), { body: 'short', truncated: false });
assert.deepEqual(truncateBody('x'.repeat(25), 10), { body: 'x'.repeat(10), truncated: true });
assert.deepEqual(truncateBody('x'.repeat(25), 0), { body: 'x'.repeat(25), truncated: false });
assert.equal(Buffer.byteLength(truncateBody('é'.repeat(20), 11).body.replace(/�$/, '')), 10);

// Settings round trip with defaults for missing/bad values.
const c = new Database(':memory:');
c.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')");
assert.equal(readRetention(c).maxRunsPerChain, 500);
writeRetention(c, s);
assert.deepEqual(readRetention(c), s);
c.prepare("UPDATE settings SET value = '-3' WHERE key = 'history_maxAgeDays'").run();
assert.equal(readRetention(c).maxAgeDays, 0);

console.log('retention check: ok');
