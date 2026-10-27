// Run: node checks/load-test-stats.check.mjs  (Node >= 23 strips TS types on import)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const src = new URL('../src/', import.meta.url);
registerHooks({
  resolve(spec, ctx, next) {
    const base = spec.startsWith('@/') ? new URL(spec.slice(2), src)
      : spec.startsWith('.') && ctx.parentURL?.endsWith('.ts') && !path.extname(spec) ? new URL(spec, ctx.parentURL)
      : null;
    if (base) {
      const file = new URL(`${base.href}.ts`);
      spec = (fs.existsSync(file) ? file : new URL(`${base.href}/index.ts`)).href;
    }
    return next(spec, ctx);
  },
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lt-stats-'));
fs.symlinkSync(src.pathname, path.join(tmp, 'src'));
process.chdir(tmp);

const db = await import('../src/lib/db/index.ts');

const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
assert.equal(db.percentile(sorted, 50), 50);
assert.equal(db.percentile(sorted, 95), 95);
assert.equal(db.percentile(sorted, 99), 99);
assert.equal(db.percentile([7], 99), 7);
assert.equal(db.percentile([], 50), null);

const chain = db.createChain({ name: 'LT', description: '', mode: 'chain' });
const lt = db.createLoadTest(chain.id, 4, 2);
const h = db.historyDb;
const t0 = lt.started_at;
[100, 200, 300, 400].forEach((ms, i) => {
  h.prepare('INSERT INTO runs (id, chain_id, load_test_id, status, started_at, finished_at) VALUES (?,?,?,?,?,?)')
    .run(`r${i}`, chain.id, lt.id, 'completed', t0, t0 + ms);
});
const step = (id, run, status, code) =>
  h.prepare('INSERT INTO run_steps (id, run_id, step_id, step_name, order_index, status, response_status) VALUES (?,?,?,?,?,?,?)')
    .run(id, run, 's', 's', 0, status, code);
step('a', 'r0', 'failed', 500);
step('b', 'r1', 'failed', 500);
step('c', 'r2', 'failed', null);
step('d', 'r3', 'completed', 200);
h.prepare('UPDATE load_tests SET finished_at = ? WHERE id = ?').run(t0 + 1000, lt.id);

const stats = db.getLoadTestStats(db.getLoadTest(lt.id));
assert.equal(stats.p50, 200);
assert.equal(stats.p99, 400);
assert.equal(stats.rps, 4);
assert.deepEqual(stats.errors, { 500: 2, error: 1 });

fs.rmSync(tmp, { recursive: true, force: true });
console.log('load-test-stats ok');
