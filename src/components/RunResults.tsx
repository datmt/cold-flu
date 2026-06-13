'use client';

import { useMemo, useState, type ReactElement } from 'react';

import type { ChainRunDetail, RunStep } from '@/lib/types';
import { prettyJsonLike } from '@/lib/formatters';

interface RunResultsProps {
  run: ChainRunDetail;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="rounded px-2 py-0.5 text-xs font-medium transition text-gray-400 hover:text-white hover:bg-gray-700"
      title="Copy to clipboard"
    >
      {copied ? '✓ Copied' : '⧉ Copy'}
    </button>
  );
}

function SectionHeader({ label, copyText }: { label: string; copyText?: string }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {copyText && <CopyButton text={copyText} />}
    </div>
  );
}

function formatDuration(step: RunStep) {
  if (!step.started_at || !step.finished_at) return null;
  return `${Math.max(step.finished_at - step.started_at, 0)}ms`;
}

function statusColor(status: RunStep['status']) {
  switch (status) {
    case 'completed': return 'border-green-700 bg-green-950/40 text-green-300';
    case 'failed': return 'border-red-700 bg-red-950/40 text-red-300';
    case 'running': return 'border-yellow-700 bg-yellow-950/40 text-yellow-300';
    case 'skipped': return 'border-gray-700 bg-gray-900/40 text-gray-500';
    case 'stale': return 'border-slate-700 bg-slate-950/40 text-slate-400';
    default: return 'border-gray-700 bg-gray-900 text-gray-300';
  }
}

function statusIcon(status: RunStep['status']) {
  switch (status) {
    case 'completed': return '✅';
    case 'failed': return '❌';
    case 'running': return '⏳';
    case 'skipped': return '⏭';
    case 'stale': return '◌';
    default: return '•';
  }
}

function prettyBody(body: string): string {
  return prettyJsonLike(body);
}

const urlRegex = /\bhttps?:\/\/[^\s<>"')\]]+/g;

function linkifyText(text: string): Array<string | ReactElement> {
  const parts: Array<string | ReactElement> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    const url = match[0];
    parts.push(
      <a
        key={`${index}-${url}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-indigo-300 underline decoration-indigo-400/60 hover:text-indigo-200"
      >
        {url}
      </a>,
    );
    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function buildRequestText(step: RunStep): string {
  const lines: string[] = [`${step.request_method} ${step.request_url}`];
  if (step.request_headers) {
    try {
      const headers = JSON.parse(step.request_headers) as Record<string, string>;
      for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
    } catch { /* ignore */ }
  }
  if (step.request_body) lines.push('', step.request_body);
  return lines.join('\n');
}

export default function RunResults({ run }: RunResultsProps) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const waves = useMemo(() => {
    const grouped = new Map<number, RunStep[]>();
    for (const step of run.steps) {
      const waveIndex = step.wave_index ?? step.order_index;
      const current = grouped.get(waveIndex) ?? [];
      current.push(step);
      grouped.set(waveIndex, current);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [run.steps]);

  const selectedStep = run.steps.find((s) => s.id === selectedStepId) ?? null;

  const totalDuration = useMemo(() => {
    const started = run.steps.reduce((min, s) => (s.started_at && s.started_at < min ? s.started_at : min), Infinity);
    const finished = run.steps.reduce((max, s) => (s.finished_at && s.finished_at > max ? s.finished_at : max), 0);
    if (started === Infinity || finished === 0) return null;
    return `${finished - started}ms`;
  }, [run.steps]);

  return (
    <div className="space-y-4">
      {/* Run summary header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${run.status === 'completed' ? 'bg-green-900/60 text-green-300' : run.status === 'failed' ? 'bg-red-900/60 text-red-300' : 'bg-yellow-900/60 text-yellow-300'}`}>
            {run.status}
          </span>
          <span className="text-sm text-gray-400">{run.completed_steps}/{run.total_steps} steps completed</span>
          {totalDuration && <span className="text-sm text-gray-500">· {totalDuration} total</span>}
        </div>
        <span className="font-mono text-xs text-gray-600">{run.id.slice(0, 8)}</span>
      </div>

      {/* Horizontally scrollable wave/step cards */}
      {waves.length === 0 ? (
        <p className="text-sm text-gray-500">No run steps recorded yet.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-1">
          {waves.map(([waveIndex, steps], i) => (
            <div key={waveIndex} className="flex flex-shrink-0 items-start gap-4">
              {i > 0 && <div className="mt-9 h-px w-6 flex-shrink-0 self-start border-t border-dashed border-gray-700" />}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Wave {waveIndex} · {steps.length} step{steps.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-col gap-2">
                  {steps.map((step) => {
                    const duration = formatDuration(step);
                    const isSelected = selectedStepId === step.id;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setSelectedStepId(isSelected ? null : step.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-900/30 text-indigo-200 ring-1 ring-indigo-500'
                            : statusColor(step.status)
                        }`}
                      >
                        <span>{statusIcon(step.status)}</span>
                        <span className="font-medium">{step.step_name}</span>
                        {step.response_status !== null && (
                          <span className="rounded bg-black/30 px-1.5 py-0.5 text-xs">{step.response_status}</span>
                        )}
                        {duration && <span className="text-xs opacity-70">{duration}</span>}
                        {step.from_cache && <span className="text-xs text-yellow-400">💾</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail panel for selected step */}
      {selectedStep && (
        <div className="rounded-xl border border-indigo-800/60 bg-gray-900/80 p-4 space-y-4 text-sm text-gray-300">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>{statusIcon(selectedStep.status)}</span>
              <span className="font-semibold text-white">{selectedStep.step_name}</span>
              {selectedStep.response_status !== null && (
                <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">{selectedStep.response_status}</span>
              )}
              {selectedStep.from_cache && <span className="text-xs text-yellow-400">[FROM CACHE 💾]</span>}
              {formatDuration(selectedStep) && <span className="text-xs text-gray-500">[{formatDuration(selectedStep)}]</span>}
            </div>
            <button
              type="button"
              onClick={() => setSelectedStepId(null)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ✕ Close
            </button>
          </div>

          {selectedStep.error && (
            <pre className="whitespace-pre-wrap break-all rounded bg-red-950/40 p-3 font-sans text-sm text-red-300">
              {selectedStep.error}
            </pre>
          )}

          {selectedStep.request_method && selectedStep.request_url && (
            <div>
              <SectionHeader label="Request" copyText={buildRequestText(selectedStep)} />
              <pre className="overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-200">
                {selectedStep.request_method} {selectedStep.request_url}
                {selectedStep.request_headers && (() => {
                  try {
                    const h = JSON.parse(selectedStep.request_headers) as Record<string, string>;
                    return '\n' + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n');
                  } catch { return ''; }
                })()}
                {selectedStep.request_body ? '\n\n' + prettyBody(selectedStep.request_body) : ''}
              </pre>
            </div>
          )}

          {selectedStep.resolved_curl && (
            <div>
              <SectionHeader label="Resolved cURL" copyText={selectedStep.resolved_curl} />
              <pre className="overflow-x-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-200">{selectedStep.resolved_curl}</pre>
            </div>
          )}

          {selectedStep.response_body && (
            <div>
              <SectionHeader label="Response body" copyText={prettyBody(selectedStep.response_body)} />
              <pre className="max-h-72 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-200">
                {linkifyText(prettyBody(selectedStep.response_body))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
