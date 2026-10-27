import path from 'node:path';
import { Worker } from 'node:worker_threads';

import db, { historyDb } from '@/lib/db';
import { cancelLoadTest, createLoadTest, getLoadTest } from '@/lib/db';

const DEBUG = process.env.DEBUG_LOAD_TEST === '1' || process.env.DEBUG_EXECUTOR === '1';

function dbg(...args: unknown[]) {
  if (DEBUG) console.log('[LOAD-TEST]', new Date().toISOString(), ...args);
}

// Plain path string so the bundler leaves the file alone; it's loaded at runtime, see load-test-worker.mjs.
const WORKER_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), ...['src', 'lib', 'executor', 'load-test-worker.mjs']);

/** Running load test workers, by load test id. */
const workers = new Map<string, Worker>();

/**
 * Starts a load test: runs `total` full chain executions with at most
 * `concurrency` running simultaneously, in a worker thread so the request
 * handlers and UI polling stay responsive. Returns immediately with the loadTestId.
 */
export function startLoadTest(chainId: string, total: number, concurrency: number): string {
  const count = (db.prepare('SELECT COUNT(*) as n FROM steps WHERE chain_id = ?').get(chainId) as { n: number }).n;
  if (count === 0) throw new Error('No steps in chain');

  const loadTest = createLoadTest(chainId, total, concurrency);
  dbg(`started loadTestId=${loadTest.id} chain=${chainId} total=${total} concurrency=${concurrency}`);

  const worker = new Worker(/* turbopackIgnore: true */ WORKER_FILE, { workerData: loadTest });
  workers.set(loadTest.id, worker);
  worker.on('error', (err) => dbg(`loadTest=${loadTest.id} worker error: ${String(err)}`));
  worker.on('exit', (code) => {
    workers.delete(loadTest.id);
    // Worker died before finalizing (crash, killed): don't leave the test 'running' forever.
    if (getLoadTest(loadTest.id)?.status === 'running') {
      historyDb.prepare("UPDATE load_tests SET status = 'failed', finished_at = ? WHERE id = ?").run(Date.now(), loadTest.id);
    }
    dbg(`loadTest=${loadTest.id} worker exit code=${code}`);
  });
  return loadTest.id;
}

/**
 * Signals a running load test to stop launching new iterations.
 * Already-running chain executions are allowed to finish naturally.
 */
export function requestCancelLoadTest(loadTestId: string): boolean {
  const changed = cancelLoadTest(loadTestId);
  if (changed) workers.get(loadTestId)?.postMessage('cancel');
  return changed;
}

export { getLoadTest };
