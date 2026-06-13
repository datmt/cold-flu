import { v4 as uuid } from 'uuid';

import db, { historyDb } from '@/lib/db';
import {
  cancelLoadTest,
  createLoadTest,
  finalizeLoadTest,
  getLoadTest,
  incrementLoadTestProgress,
} from '@/lib/db';
import type { LoadTest } from '@/lib/types';

import { executeChain } from './index';

const DEBUG = process.env.DEBUG_LOAD_TEST === '1' || process.env.DEBUG_EXECUTOR === '1';

function dbg(...args: unknown[]) {
  if (DEBUG) console.log('[LOAD-TEST]', new Date().toISOString(), ...args);
}

/**
 * In-memory set of load test IDs that have been requested to cancel.
 * Lives in the Node.js module singleton — safe because Next.js runs the
 * API routes in the same long-lived server process.
 */
const cancelledIds = new Set<string>();

/**
 * Starts a load test: runs `total` full chain executions with at most
 * `concurrency` running simultaneously. Returns immediately with the
 * loadTestId; execution continues fire-and-forget in the background.
 */
export function startLoadTest(chainId: string, total: number, concurrency: number): string {
  const count = (db.prepare('SELECT COUNT(*) as n FROM steps WHERE chain_id = ?').get(chainId) as { n: number }).n;
  if (count === 0) throw new Error('No steps in chain');

  const loadTest = createLoadTest(chainId, total, concurrency);
  dbg(`started loadTestId=${loadTest.id} chain=${chainId} total=${total} concurrency=${concurrency}`);
  void runLoadTest(loadTest);
  return loadTest.id;
}

/**
 * Signals a running load test to stop launching new iterations.
 * Already-running chain executions are allowed to finish naturally.
 */
export function requestCancelLoadTest(loadTestId: string): boolean {
  const changed = cancelLoadTest(loadTestId);
  if (changed) {
    cancelledIds.add(loadTestId);
  }
  return changed;
}

async function runLoadTest(loadTest: LoadTest): Promise<void> {
  const { id: loadTestId, chain_id: chainId, total, concurrency } = loadTest;

  let running = 0;
  let launched = 0;
  let completed = 0;
  let failed = 0;
  const ltStart = Date.now();

  await new Promise<void>((resolve) => {
    function tryLaunch() {
      // Stop launching new runs if cancelled.
      if (cancelledIds.has(loadTestId)) {
        dbg(`loadTest=${loadTestId} cancelled, waiting for ${running} in-flight runs`);
        if (running === 0) {
          cancelledIds.delete(loadTestId);
          resolve();
        }
        return;
      }

      while (running < concurrency && launched < total) {
        // Re-check cancellation inside the loop — another iteration may have set it.
        if (cancelledIds.has(loadTestId)) break;

        running++;
        launched++;

        const runId = uuid();
        const launchTime = Date.now();
        dbg(`loadTest=${loadTestId} launching run=${runId} (#${launched}/${total}) concurrency_slot=${running}/${concurrency}`);

        try {
          historyDb.prepare('INSERT INTO runs (id, chain_id, load_test_id, status, started_at) VALUES (?, ?, ?, ?, ?)').run(
            runId,
            chainId,
            loadTestId,
            'running',
            launchTime,
          );
        } catch (err) {
          // Undo increments — this slot never actually launched.
          running--;
          launched--;
          dbg(`loadTest=${loadTestId} failed to create run: ${String(err)}`);
          break;
        }

        executeChain(chainId, runId)
          .then(() => {
            const row = historyDb.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as
              | { status: string }
              | undefined;
            const outcome = row?.status === 'failed' ? 'failed' : 'completed';
            // Only count progress if not already cancelled in the DB.
            const lt = historyDb.prepare('SELECT status FROM load_tests WHERE id = ?').get(loadTestId) as
              | { status: string }
              | undefined;
            if (lt?.status === 'running') {
              incrementLoadTestProgress(loadTestId, outcome);
            }
            if (outcome === 'completed') completed++; else failed++;
            dbg(`loadTest=${loadTestId} run=${runId} outcome=${outcome} duration=${Date.now() - launchTime}ms progress=${completed + failed}/${total} (ok=${completed} fail=${failed}) concurrency_free=${concurrency - (running - 1)}`);
          })
          .catch((err: unknown) => {
            const lt = historyDb.prepare('SELECT status FROM load_tests WHERE id = ?').get(loadTestId) as
              | { status: string }
              | undefined;
            if (lt?.status === 'running') {
              incrementLoadTestProgress(loadTestId, 'failed');
            }
            failed++;
            dbg(`loadTest=${loadTestId} run=${runId} ERROR duration=${Date.now() - launchTime}ms err=${String(err)}`);
          })
          .finally(() => {
            running--;
            if (cancelledIds.has(loadTestId)) {
              if (running === 0) {
                dbg(`loadTest=${loadTestId} cancelled and drained total_duration=${Date.now() - ltStart}ms`);
                cancelledIds.delete(loadTestId);
                resolve();
              }
            } else if (launched < total) {
              try {
                tryLaunch();
              } catch (err) {
                dbg(`loadTest=${loadTestId} tryLaunch error: ${String(err)}`);
              }
              // If tryLaunch launched nothing (DB error, etc.) and no chains are
              // in flight, finalize rather than hang forever.
              if (running === 0) {
                finalizeLoadTest(loadTestId);
                resolve();
              }
            } else if (running === 0) {
              dbg(`loadTest=${loadTestId} DONE ok=${completed} fail=${failed} total_duration=${Date.now() - ltStart}ms`);
              finalizeLoadTest(loadTestId);
              resolve();
            }
          });
      }

      // All work launched before any finished (concurrency >= total).
      if (!cancelledIds.has(loadTestId) && launched >= total && running === 0) {
        dbg(`loadTest=${loadTestId} DONE (sync path) ok=${completed} fail=${failed} total_duration=${Date.now() - ltStart}ms`);
        finalizeLoadTest(loadTestId);
        resolve();
      }
    }

    tryLaunch();
  });
}

export { getLoadTest };
