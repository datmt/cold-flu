'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import RequestEditor from '@/components/RequestEditor';
import RunResults from '@/components/RunResults';
import { apiFetch, formatDateTime } from '@/lib/client';
import type { ChainDetail, ChainRun, ChainRunDetail, Environment } from '@/lib/types';

interface SimpleRequestViewProps {
  chain: ChainDetail;
  environments: Environment[];
  onChainUpdate: (chain: ChainDetail) => void;
}

export default function SimpleRequestView({ chain, environments, onChainUpdate }: SimpleRequestViewProps) {
  const step = chain.steps[0] ?? null;

  const [name, setName] = useState(chain.name);
  const [editingName, setEditingName] = useState(false);
  const [curlTemplate, setCurlTemplate] = useState(step?.curl_template ?? '');
  const [environmentId, setEnvironmentId] = useState<string | null>(chain.environment_id);
  const [runs, setRuns] = useState<ChainRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ChainRunDetail | null>(null);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRuns = useCallback(async () => {
    const nextRuns = await apiFetch<ChainRun[]>(`/api/chains/${chain.id}/runs?limit=20`);
    setRuns(nextRuns);
    return nextRuns;
  }, [chain.id]);

  const loadRun = useCallback(async (runId: string) => {
    const run = await apiFetch<ChainRunDetail>(`/api/runs/${runId}`);
    setSelectedRun(run);
    return run;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextRuns = await loadRuns();
        if (cancelled) return;
        if (nextRuns.length > 0) {
          await loadRun(nextRuns[0].id);
        } else {
          setSelectedRun(null);
        }
      } catch {
        // ignore — run history is best-effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRuns, loadRun]);

  useEffect(
    () => () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    },
    [],
  );

  const commitName = async () => {
    setEditingName(false);
    if (!name.trim() || name === chain.name) {
      setName(chain.name);
      return;
    }
    const updated = await apiFetch<ChainDetail>(`/api/chains/${chain.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: name.trim() }),
    });
    onChainUpdate(updated);
  };

  const commitEnvironment = async (nextEnvironmentId: string | null) => {
    setEnvironmentId(nextEnvironmentId);
    const updated = await apiFetch<ChainDetail>(`/api/chains/${chain.id}`, {
      method: 'PUT',
      body: JSON.stringify({ environment_id: nextEnvironmentId }),
    });
    onChainUpdate(updated);
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCurlChange = (next: string) => {
    setCurlTemplate(next);
    if (!step) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void apiFetch(`/api/steps/${step.id}`, {
        method: 'PUT',
        body: JSON.stringify({ curl_template: next }),
      });
    }, 600);
  };

  const send = async () => {
    if (!step) return;
    setSending(true);
    setError(null);

    try {
      const { runId } = await apiFetch<{ runId: string }>(`/api/steps/${step.id}/run`, { method: 'POST' });
      await loadRuns();
      await loadRun(runId);

      const poll = async () => {
        try {
          const run = await apiFetch<ChainRunDetail>(`/api/runs/${runId}`);
          setSelectedRun(run);
          if (run.status === 'running') {
            pollingRef.current = setTimeout(() => void poll(), 500);
          } else {
            setSending(false);
            void loadRuns();
          }
        } catch {
          setSending(false);
        }
      };

      pollingRef.current = setTimeout(() => void poll(), 500);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send request');
      setSending(false);
    }
  };

  const convertToChain = async () => {
    setConverting(true);
    try {
      const updated = await apiFetch<ChainDetail>(`/api/chains/${chain.id}`, {
        method: 'PUT',
        body: JSON.stringify({ mode: 'chain' }),
      });
      onChainUpdate(updated);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : 'Failed to convert to chain');
      setConverting(false);
    }
  };

  const envVariables = environments.find((e) => e.id === environmentId)?.variables ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setName(chain.name); setEditingName(false); }
              }}
              className="w-full rounded-lg border border-indigo-500 bg-gray-950 px-2 py-1 text-lg font-semibold text-white outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="truncate text-left text-lg font-semibold text-white hover:text-indigo-300"
              title="Click to rename"
            >
              {chain.name}
            </button>
          )}
        </div>

        <select
          value={environmentId ?? ''}
          onChange={(e) => void commitEnvironment(e.target.value || null)}
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
        >
          <option value="">No environment</option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void convertToChain()}
          disabled={converting}
          className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:border-purple-500 disabled:opacity-50"
        >
          {converting ? 'Converting…' : '⇄ Convert to Chain'}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

      {step ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
          <RequestEditor
            curlTemplate={curlTemplate}
            envVariables={Object.keys(envVariables)}
            onChange={handleCurlChange}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? '⏳ Sending…' : '▶ Send'}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
          This request has no step yet.
        </div>
      )}

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-200">Recent sends</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">No sends yet.</p>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => void loadRun(run.id)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  selectedRun?.id === run.id ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {run.status === 'completed' ? '✅' : run.status === 'failed' ? '❌' : '⏳'} {formatDateTime(run.started_at)}
              </button>
            ))}
          </div>
        )}

        {selectedRun ? (
          <RunResults run={selectedRun} />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-6 text-sm text-gray-500">
            Send the request to see the response here.
          </div>
        )}
      </div>
    </div>
  );
}
