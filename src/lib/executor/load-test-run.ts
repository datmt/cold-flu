import { v4 as uuid } from 'uuid';

import { historyDb } from '@/lib/db';
import { finalizeLoadTest, incrementLoadTestProgress } from '@/lib/db';
import type { LoadTest } from '@/lib/types';

import { executeChain } from './index';

const DEBUG = process.env.DEBUG_LOAD_TEST === '1' || process.env.DEBUG_EXECUTOR === '1';

function dbg(...args: unknown[]) {
  if (DEBUG) console.log('[LOAD-TEST]', new Date().toISOString(), ...args);
}

/**
 * Load test IDs requested to cancel. Lives in the worker thread running the test.
 */
const cancelledIds = new Set<string>();

/** Signals this load test to stop launching new iterations (called from the worker's message handler). */
export function markCancelled(loadTestId: string): void {
  cancelledIds.add(loadTestId);
}

export async function runLoadTest(loadTest: LoadTest): Promise<void> {
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

        // setEnv stays in-memory here: N iterations must not race on the real environment.
        executeChain(chainId, runId, false)
          .then(() => {
            // Single transaction: read run status, read load-test status, and bump
            // the progress counter in one commit instead of three separate round trips.
            const outcome = historyDb.transaction(() => {
              const row = historyDb.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as
                | { status: string }
                | undefined;
              const result = row?.status === 'failed' ? 'failed' : 'completed';
              const lt = historyDb.prepare('SELECT status FROM load_tests WHERE id = ?').get(loadTestId) as
                | { status: string }
                | undefined;
              if (lt?.status === 'running') {
                incrementLoadTestProgress(loadTestId, result);
              }
              return result;
            })();
            if (outcome === 'completed') completed++; else failed++;
            dbg(`loadTest=${loadTestId} run=${runId} outcome=${outcome} duration=${Date.now() - launchTime}ms progress=${completed + failed}/${total} (ok=${completed} fail=${failed}) concurrency_free=${concurrency - (running - 1)}`);
          })
          .catch((err: unknown) => {
            historyDb.transaction(() => {
              const lt = historyDb.prepare('SELECT status FROM load_tests WHERE id = ?').get(loadTestId) as
                | { status: string }
                | undefined;
              if (lt?.status === 'running') {
                incrementLoadTestProgress(loadTestId, 'failed');
              }
            })();
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
