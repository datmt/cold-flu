import { v4 as uuid } from 'uuid';

import db from '@/lib/db';
import {
  cancelLoadTest,
  createLoadTest,
  finalizeLoadTest,
  getLoadTest,
  incrementLoadTestProgress,
} from '@/lib/db';
import type { LoadTest } from '@/lib/types';

import { executeChain } from './index';

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

  await new Promise<void>((resolve) => {
    function tryLaunch() {
      // Stop launching new runs if cancelled.
      if (cancelledIds.has(loadTestId)) {
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
        db.prepare('INSERT INTO runs (id, chain_id, load_test_id, status, started_at) VALUES (?, ?, ?, ?, ?)').run(
          runId,
          chainId,
          loadTestId,
          'running',
          Date.now(),
        );

        executeChain(chainId, runId)
          .then(() => {
            const row = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as
              | { status: string }
              | undefined;
            const outcome = row?.status === 'failed' ? 'failed' : 'completed';
            // Only count progress if not already cancelled in the DB.
            const lt = db.prepare('SELECT status FROM load_tests WHERE id = ?').get(loadTestId) as
              | { status: string }
              | undefined;
            if (lt?.status === 'running') {
              incrementLoadTestProgress(loadTestId, outcome);
            }
          })
          .catch(() => {
            const lt = db.prepare('SELECT status FROM load_tests WHERE id = ?').get(loadTestId) as
              | { status: string }
              | undefined;
            if (lt?.status === 'running') {
              incrementLoadTestProgress(loadTestId, 'failed');
            }
          })
          .finally(() => {
            running--;
            if (cancelledIds.has(loadTestId)) {
              if (running === 0) {
                cancelledIds.delete(loadTestId);
                resolve();
              }
            } else if (launched < total) {
              tryLaunch();
            } else if (running === 0) {
              finalizeLoadTest(loadTestId);
              resolve();
            }
          });
      }

      // All work launched before any finished (concurrency >= total).
      if (!cancelledIds.has(loadTestId) && launched >= total && running === 0) {
        finalizeLoadTest(loadTestId);
        resolve();
      }
    }

    tryLaunch();
  });
}

export { getLoadTest };
