'use client';

import type { Edge, Node } from '@xyflow/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import RunResults from '@/components/RunResults';
import { apiFetch } from '@/lib/client';
import { extractMethodFromCurl, getNodeType } from '@/lib/steps';
import type { ChainDetail, ChainRun, ChainRunDetail, Environment, LoadTest } from '@/lib/types';

const FlowEditor = dynamic(() => import('@/components/FlowEditor'), { ssr: false });

interface ChainPageProps {
  params: Promise<{ id: string }>;
}

export default function ChainPage({ params }: ChainPageProps) {
  const { id } = use(params);
  const [chain, setChain] = useState<ChainDetail | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [runs, setRuns] = useState<ChainRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ChainRunDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [loadTestOpen, setLoadTestOpen] = useState(false);
  const [loadTestId, setLoadTestId] = useState<string | null>(null);
  const [loadTest, setLoadTest] = useState<LoadTest | null>(null);
  const loadTestPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    environment_id: null as string | null,
  });

  const loadChain = useCallback(async () => {
    const nextChain = await apiFetch<ChainDetail>(`/api/chains/${id}`);
    setChain(nextChain);
    setForm({
      name: nextChain.name,
      description: nextChain.description,
      environment_id: nextChain.environment_id,
    });
    return nextChain;
  }, [id]);

  const loadRuns = useCallback(async () => {
    const nextRuns = await apiFetch<ChainRun[]>(`/api/chains/${id}/runs?limit=50`);
    setRuns(nextRuns);
    return nextRuns;
  }, [id]);

  const loadRun = useCallback(async (runId: string) => {
    const run = await apiFetch<ChainRunDetail>(`/api/runs/${runId}`);
    setSelectedRun(run);
    setSelectedRunId(runId);
    setResultsOpen(true);
    return run;
  }, []);

  const pollLoadTest = useCallback((ltId: string) => {
    const poll = async () => {
      try {
        const lt = await apiFetch<LoadTest>(`/api/load-tests/${ltId}`);
        setLoadTest(lt);
        if (lt.status === 'running') {
          loadTestPollRef.current = setTimeout(() => void poll(), 800);
        } else {
          // completed, failed, or cancelled — refresh run list
          void loadRuns();
        }
      } catch {
        // silently stop polling on error
      }
    };
    loadTestPollRef.current = setTimeout(() => void poll(), 800);
  }, [loadRuns]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [nextChain, nextEnvironments, nextRuns, loadTests] = await Promise.all([
          loadChain(),
          apiFetch<Environment[]>('/api/environments'),
          loadRuns(),
          apiFetch<LoadTest[]>(`/api/chains/${id}/load-tests`),
        ]);

        if (cancelled) {
          return;
        }

        setChain(nextChain);
        setEnvironments(nextEnvironments);
        setRuns(nextRuns);

        if (nextRuns.length > 0) {
          await loadRun(nextRuns[0].id);
        } else {
          setSelectedRun(null);
          setSelectedRunId(null);
        }

        // Reconnect to a running load test if one exists for this chain.
        const activeLoadTest = loadTests.find((lt) => lt.status === 'running');
        if (activeLoadTest && !cancelled) {
          setLoadTestId(activeLoadTest.id);
          setLoadTest(activeLoadTest);
          pollLoadTest(activeLoadTest.id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load chain');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [loadChain, loadRun, loadRuns, pollLoadTest]);

  const runStepStatuses = useMemo(() => {
    if (!selectedRun) return undefined;
    const map = Object.fromEntries(selectedRun.steps.map((s) => [s.step_id, s.status]));
    if (selectedRun.status !== 'running') {
      for (const [stepId, status] of Object.entries(map)) {
        if (status === 'stale') {
          delete map[stepId];
        }
      }
    }
    return map;
  }, [selectedRun]);

  const initialNodes = useMemo<Node[]>(() => {
    if (!chain) {
      return [];
    }

    return chain.steps.map((step) => ({
      id: step.id,
      type: getNodeType(step.type),
      position: { x: step.position_x, y: step.position_y },
      data: {
        label: step.name,
        method: extractMethodFromCurl(step.curl_template),
        cacheEnabled: step.cache_enabled === 1,
        step,
      },
    }));
  }, [chain]);

  const initialEdges = useMemo<Edge[]>(() => {
    if (!chain) {
      return [];
    }

    return chain.steps.flatMap((step) =>
      (step.depends_on ?? []).map((dependencyId) => {
        const sourceHandle = step.dependency_handles?.[dependencyId] ?? null;
        const edgeStyle =
          sourceHandle === 'true'
            ? { stroke: '#22c55e' }
            : sourceHandle === 'false'
              ? { stroke: '#ef4444' }
              : { stroke: '#6366f1' };
        return {
          id: `${dependencyId}:${sourceHandle ?? 'default'}->${step.id}`,
          source: dependencyId,
          target: step.id,
          sourceHandle,
          animated: true,
          style: edgeStyle,
          label: sourceHandle ?? undefined,
          labelStyle: { fill: edgeStyle.stroke, fontWeight: 600, fontSize: 11 },
          labelBgStyle: { fill: '#111827', fillOpacity: 0.85 },
        };
      }),
    );
  }, [chain]);

  const saveSettings = async () => {
    if (!chain) {
      return;
    }

    setSavingSettings(true);
    setError(null);

    try {
      const updatedChain = await apiFetch<ChainDetail>(`/api/chains/${chain.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setChain(updatedChain);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save chain settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Stop any active poll on unmount.
  useEffect(() => () => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    if (loadTestPollRef.current) clearTimeout(loadTestPollRef.current);
  }, []);

  const startRunPolling = useCallback(async (runId: string) => {
    await loadRuns();
    await loadRun(runId);

    const poll = async () => {
      try {
        const run = await apiFetch<ChainRunDetail>(`/api/runs/${runId}`);
        setSelectedRun(run);

        if (run.status === 'running') {
          pollingRef.current = setTimeout(() => void poll(), 500);
        } else {
          setRunning(false);
          void loadRuns(); // refresh status badge in the run list
        }
      } catch {
        setRunning(false);
      }
    };

    pollingRef.current = setTimeout(() => void poll(), 500);
  }, [loadRun, loadRuns]);

  const startLoadTestRun = useCallback(async (total: number, concurrency: number) => {
    if (!chain) return;
    setError(null);
    try {
      const { loadTestId: ltId } = await apiFetch<{ loadTestId: string }>(
        `/api/chains/${chain.id}/load-test`,
        { method: 'POST', body: JSON.stringify({ total, concurrency }) },
      );
      const lt = await apiFetch<LoadTest>(`/api/load-tests/${ltId}`);
      setLoadTestId(ltId);
      setLoadTest(lt);
      pollLoadTest(ltId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start load test');
    }
  }, [chain, pollLoadTest]);

  const stopLoadTest = useCallback(async () => {
    if (!loadTestId) return;
    try {
      await apiFetch(`/api/load-tests/${loadTestId}/cancel`, { method: 'POST' });
      // The poll will detect the status change and stop itself.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop load test');
    }
  }, [loadTestId]);

  const runChain = async () => {
    if (!chain) {
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const { runId } = await apiFetch<{ runId: string }>(`/api/chains/${chain.id}/run`, {
        method: 'POST',
      });

      // Show the run immediately (status = 'running') and open the results panel.
      await startRunPolling(runId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run chain');
      setRunning(false);
    }
  };

  const runStep = async (stepId: string) => {
    setRunning(true);
    setError(null);

    try {
      const { runId } = await apiFetch<{ runId: string }>(`/api/steps/${stepId}/run`, {
        method: 'POST',
      });
      await startRunPolling(runId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run step');
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading chain…</div>;
  }

  if (!chain) {
    return <div className="p-6 text-sm text-red-400">{error ?? 'Chain not found'}</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-indigo-400 transition hover:text-indigo-300">
            ← Back to chains
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-white">ColdFlu</h1>
          <p className="text-sm text-gray-400">Build DAGs, fan out parallel requests, and join results downstream.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLoadTestOpen(true)}
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-100 transition hover:border-purple-500"
          >
            ⚡ Load Test
          </button>
          <a
            href={`/api/chains/${chain.id}/export`}
            download
            className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-100 transition hover:border-indigo-500"
          >
            ↓ Export
          </a>
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 md:grid-cols-[minmax(0,1fr)_280px_auto] md:items-end">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Chain name</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Environment</span>
          <select
            value={form.environment_id ?? ''}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                environment_id: event.target.value ? event.target.value : null,
              }))
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
          >
            <option value="">None</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={savingSettings}
          className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </button>

        <label className="block space-y-2 md:col-span-3">
          <span className="text-sm font-medium text-gray-200">Description</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            rows={2}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
          />
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

      <FlowEditor
        chainId={chain.id}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        environments={environments}
        selectedEnvironmentId={form.environment_id}
        onRunComplete={(runId) => {
          void loadRun(runId);
        }}
        onRun={runChain}
        onRunStep={runStep}
        running={running}
        runStepStatuses={runStepStatuses}
      />

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60">
        <button
          type="button"
          onClick={() => setResultsOpen((current) => !current)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-white">Run Results</h2>
            <p className="text-sm text-gray-400">Inspect execution waves, cache hits, and downstream joins.</p>
          </div>
          <span className="text-sm text-gray-400">{resultsOpen ? 'Hide' : 'Show'}</span>
        </button>

        {resultsOpen && (
          <RunHistorySection
            runs={runs}
            selectedRunId={selectedRunId}
            selectedRun={selectedRun}
            onSelect={(runId) => void loadRun(runId)}
            totalCapped={runs.length >= 50}
          />
        )}
      </div>

      {loadTestOpen && (
        <LoadTestModal
          onClose={() => setLoadTestOpen(false)}
          onStart={(total, concurrency) => {
            setLoadTestOpen(false);
            void startLoadTestRun(total, concurrency);
          }}
        />
      )}

      {loadTest && (
        <LoadTestProgress
          loadTest={loadTest}
          onDismiss={() => { setLoadTest(null); setLoadTestId(null); }}
          onViewRun={(runId) => void loadRun(runId)}
          chainId={chain.id}
          onStop={() => void stopLoadTest()}
        />
      )}
    </div>
  );
}

const MAX_VISIBLE_RUNS = 5;

function formatRunDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function RunButton({ run, selected, onClick }: { run: ChainRun; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm transition whitespace-nowrap ${selected ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
    >
      {run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '⏳'}{' '}
      {formatRunDate(run.started_at)}
    </button>
  );
}

function OlderRunsModal({ runs, selectedRunId, onSelect, onClose, capped }: {
  runs: ChainRun[];
  selectedRunId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  capped?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Older Runs</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">✕ Close</button>
        </div>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {runs.map((run) => (
            <RunButton
              key={run.id}
              run={run}
              selected={selectedRunId === run.id}
              onClick={() => { onSelect(run.id); onClose(); }}
            />
          ))}
        </div>
        {capped && (
          <p className="mt-3 text-center text-xs text-gray-500">Showing the 50 most recent runs. Older runs are not loaded.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function RunHistorySection({ runs, selectedRunId, selectedRun, onSelect, totalCapped }: {
  runs: ChainRun[];
  selectedRunId: string | null;
  selectedRun: ChainRunDetail | null;
  onSelect: (id: string) => void;
  totalCapped?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const visibleRuns = runs.slice(0, MAX_VISIBLE_RUNS);
  const olderRuns = runs.slice(MAX_VISIBLE_RUNS);

  return (
    <div className="space-y-4 border-t border-gray-800 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {runs.length > 0 ? (
          <>
            {visibleRuns.map((run) => (
              <RunButton
                key={run.id}
                run={run}
                selected={selectedRunId === run.id}
                onClick={() => onSelect(run.id)}
              />
            ))}
            {olderRuns.length > 0 && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 transition hover:border-indigo-500 hover:text-indigo-300"
              >
                +{olderRuns.length} older{totalCapped ? " (capped at 50)" : ""}…
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">No runs yet. Execute the chain to populate this panel.</p>
        )}
      </div>

      {modalOpen && (
        <OlderRunsModal
          runs={olderRuns}
          selectedRunId={selectedRunId}
          onSelect={onSelect}
          onClose={() => setModalOpen(false)}
          capped={totalCapped}
        />
      )}

      {selectedRun ? (
        <RunResults run={selectedRun} />
      ) : (
        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
          Select a run to inspect responses.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Load Test modal
// ---------------------------------------------------------------------------

function LoadTestModal({ onClose, onStart }: {
  onClose: () => void;
  onStart: (total: number, concurrency: number) => void;
}) {
  const [total, setTotal] = useState('100');
  const [concurrency, setConcurrency] = useState('5');
  const [error, setError] = useState('');

  const submit = () => {
    const t = Number(total);
    const c = Number(concurrency);
    if (!Number.isInteger(t) || t < 1) { setError('Total must be a positive integer'); return; }
    if (!Number.isInteger(c) || c < 1) { setError('Concurrency must be a positive integer'); return; }
    if (c > t) { setError('Concurrency cannot exceed total'); return; }
    onStart(t, c);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">⚡ Load Test</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-gray-300">Total requests</span>
          <input
            type="number"
            min={1}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-gray-300">Concurrent users</span>
          <input
            type="number"
            min={1}
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
          >
            Start
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Load Test progress panel
// ---------------------------------------------------------------------------

function LoadTestProgress({ loadTest, onDismiss, onViewRun, chainId, onStop }: {
  loadTest: LoadTest;
  onDismiss: () => void;
  onViewRun: (runId: string) => void;
  chainId: string;
  onStop: () => void;
}) {
  const { total, completed, failed, status } = loadTest;
  const done = completed + failed;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const elapsed = loadTest.finished_at
    ? loadTest.finished_at - loadTest.started_at
    : Date.now() - loadTest.started_at;
  const rps = elapsed > 0 ? ((done / elapsed) * 1000).toFixed(1) : '—';

  // Detect stale progress: track how long since `done` last changed.
  const prevDoneRef = useRef(done);
  const lastProgressRef = useRef(Date.now());
  if (done !== prevDoneRef.current) {
    prevDoneRef.current = done;
    lastProgressRef.current = Date.now();
  }
  const secondsSinceProgress = Math.floor((Date.now() - lastProgressRef.current) / 1000);
  const isStale = status === 'running' && secondsSinceProgress >= 5;

  const statusColor =
    status === 'completed' ? 'border-green-700 bg-green-950/30' :
    status === 'failed' ? 'border-red-700 bg-red-950/30' :
    status === 'cancelled' ? 'border-yellow-700 bg-yellow-950/30' :
    'border-purple-700 bg-purple-950/30';

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${statusColor}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">⚡ Load Test</span>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-black/30 text-gray-300">
            {total} × chain · {loadTest.concurrency} concurrent
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            status === 'completed' ? 'text-green-300' :
            status === 'failed' ? 'text-red-300' :
            status === 'cancelled' ? 'text-yellow-300' :
            'text-purple-300'
          }`}>
            {status === 'running' ? '⏳ running' :
             status === 'completed' ? '✅ done' :
             status === 'cancelled' ? '⛔ cancelled' :
             '❌ done'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg border border-red-700 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900/40 transition"
            >
              ⛔ Stop
            </button>
          )}
          {status !== 'running' && (
            <button type="button" onClick={onDismiss} className="text-xs text-gray-500 hover:text-gray-300">✕ Dismiss</button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${
              status === 'cancelled' ? 'bg-yellow-600' :
              failed > 0 ? 'bg-gradient-to-r from-purple-600 to-red-500' :
              'bg-purple-600'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{done}/{total} completed</span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-green-400">✅ {completed} passed</span>
        <span className="text-red-400">❌ {failed} failed</span>
        <span className="text-gray-400">⚡ {rps} req/s</span>
        {loadTest.finished_at && (
          <span className="text-gray-500">
            {((loadTest.finished_at - loadTest.started_at) / 1000).toFixed(1)}s total
          </span>
        )}
        {isStale && (
          <span className="text-yellow-400 text-xs self-center">
            ⚠ no progress for {secondsSinceProgress}s — executor may have stalled
          </span>
        )}
      </div>
    </div>
  );
}
