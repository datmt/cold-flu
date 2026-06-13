'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { isJsonLike, prettyJsonLike } from '@/lib/formatters';
import { bracketMatching } from '@codemirror/language';
import { lineNumbers } from '@codemirror/view';

import VariableHelper from '@/components/VariableHelper';
import { DEFAULT_CONDITION_CODE, DEFAULT_TRANSFORM_CODE } from '@/lib/steps';
import type { Step, StepType } from '@/lib/types';

interface StepEditPanelProps {
  step: Step | null;
  envVariables: string[];
  availableStepRefs: string[];
  onSave: (
    stepId: string,
    updates: {
      name?: string;
      curl_template?: string;
      transform_code?: string;
      type?: StepType;
      cache_enabled?: number;
      cache_ttl?: number;
      position_x?: number;
      position_y?: number;
    },
  ) => Promise<Step>;
  onDelete: (stepId: string) => Promise<void>;
  onDuplicate: (stepId: string) => Promise<void>;
  onRunStep?: (stepId: string) => Promise<void>;
  running?: boolean;
  busy?: boolean;
}

interface FormState {
  name: string;
  type: StepType;
  curl_template: string;
  transform_code: string;
  cache_enabled: boolean;
  cache_ttl: number;
}

// ─── Curl decomposition helpers ──────────────────────────────────────────────

interface CurlParts {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function parseCurlToParts(curlTemplate: string): CurlParts {
  try {
    // Normalize line continuations
    const normalized = curlTemplate.replace(/\\\r?\n/g, ' ').replace(/\r?\n/g, ' ').trim();
    const tokens = tokenizeCurl(normalized);
    if (tokens[0]?.toLowerCase() === 'curl') tokens.shift();

    let method = '';
    let url = '';
    const headers: { key: string; value: string }[] = [];
    let body = '';

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '-X' || t === '--request') { method = (tokens[++i] ?? '').toUpperCase(); }
      else if (t === '-H' || t === '--header') {
        const raw = tokens[++i] ?? '';
        const colon = raw.indexOf(':');
        if (colon > 0) headers.push({ key: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim() });
        else headers.push({ key: raw.trim(), value: '' });
      } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--json'].includes(t)) {
        body = tokens[++i] ?? '';
      } else if (!t.startsWith('-') && !url) {
        url = t;
      }
    }
    return { method: method || (body ? 'POST' : 'GET'), url, headers, body };
  } catch {
    return { method: 'GET', url: '', headers: [], body: '' };
  }
}

function tokenizeCurl(cmd: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let state: 'normal' | 'single' | 'double' = 'normal';
  let started = false;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (state === 'normal') {
      if (/\s/.test(ch)) { if (started) { tokens.push(cur); cur = ''; started = false; } }
      else if (ch === "'") { state = 'single'; started = true; }
      else if (ch === '"') { state = 'double'; started = true; }
      else if (ch === '\\' && cmd[i + 1]) { cur += cmd[++i]; started = true; }
      else { cur += ch; started = true; }
    } else if (state === 'single') {
      // Single-quoted strings: no escape sequences, only ' ends the token
      if (ch === "'") state = 'normal'; else cur += ch;
    } else {
      // Double-quoted strings: decode JSON/shell escape sequences
      if (ch === '"') {
        state = 'normal';
      } else if (ch === '\\' && i + 1 < cmd.length) {
        const next = cmd[++i];
        switch (next) {
          case 'n': cur += '\n'; break;
          case 't': cur += '\t'; break;
          case 'r': cur += '\r'; break;
          case 'u': {
            // \uXXXX unicode escape
            const hex = cmd.slice(i + 1, i + 5);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) { cur += String.fromCharCode(parseInt(hex, 16)); i += 4; }
            else cur += next;
            break;
          }
          default: cur += next; // handles \" \\ \/ and anything else
        }
      } else {
        cur += ch;
      }
    }
  }
  if (started) tokens.push(cur);
  return tokens;
}

function buildCurlFromParts(parts: CurlParts): string {
  const lines: string[] = [`curl -X ${parts.method || 'GET'} '${parts.url || ''}'`];
  for (const h of parts.headers) {
    // JSON.stringify produces a double-quoted, fully-escaped string — safe for any value
    if (h.key) lines.push(`  -H ${JSON.stringify(`${h.key}: ${h.value}`)}`);
  }
  if (parts.body) {
    // JSON.stringify handles single quotes, double quotes, backslashes, newlines, unicode, etc.
    lines.push(`  -d ${JSON.stringify(parts.body)}`);
  }
  return lines.join(' \\\n');
}

// ─── CurlEditor ──────────────────────────────────────────────────────────────

function CurlEditor({
  curlTemplate,
  onChange,
}: {
  curlTemplate: string;
  onChange: (next: string) => void;
}) {
  const [parts, setParts] = useState<CurlParts>(() => parseCurlToParts(curlTemplate));
  const [bodyPrettyError, setBodyPrettyError] = useState<string | null>(null);

  const commit = useCallback(
    (next: CurlParts) => {
      setParts(next);
      onChange(buildCurlFromParts(next));
    },
    [onChange],
  );

  const setMethod = (method: string) => commit({ ...parts, method });
  const setUrl = (url: string) => commit({ ...parts, url });
  const setBody = (body: string) => { setBodyPrettyError(null); commit({ ...parts, body }); };

  const addHeader = () => commit({ ...parts, headers: [...parts.headers, { key: '', value: '' }] });
  const removeHeader = (idx: number) =>
    commit({ ...parts, headers: parts.headers.filter((_, i) => i !== idx) });
  const updateHeader = (idx: number, field: 'key' | 'value', val: string) =>
    commit({
      ...parts,
      headers: parts.headers.map((h, i) => (i === idx ? { ...h, [field]: val } : h)),
    });

  const prettifyBody = () => {
    const pretty = prettyJsonLike(parts.body);
    if (pretty === parts.body && !isJsonLike(parts.body)) {
      setBodyPrettyError('Not JSON-like');
      return;
    }
    commit({ ...parts, body: pretty });
    setBodyPrettyError(null);
  };

  const inputCls = 'rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-white outline-none transition focus:border-indigo-500';

  return (
    <div className="space-y-3">
      {/* Method + URL */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-200">Method &amp; URL</p>
        <div className="flex gap-2">
          <select
            value={parts.method}
            onChange={(e) => setMethod(e.target.value)}
            className={`w-28 shrink-0 ${inputCls} font-mono`}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            value={parts.url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            className={`flex-1 ${inputCls} font-mono`}
          />
        </div>
      </div>

      {/* Headers */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-200">Headers</p>
          <button
            type="button"
            onClick={addHeader}
            className="rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-gray-800 hover:text-indigo-300"
          >
            + Add
          </button>
        </div>
        {parts.headers.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No headers.</p>
        ) : (
          <div className="space-y-1.5">
            {parts.headers.map((h, idx) => (
              <div key={idx} className="flex gap-1.5 items-center">
                <input
                  value={h.key}
                  onChange={(e) => updateHeader(idx, 'key', e.target.value)}
                  placeholder="Header name"
                  className={`w-36 shrink-0 ${inputCls} font-mono`}
                />
                <span className="text-gray-600 text-xs">:</span>
                <input
                  value={h.value}
                  onChange={(e) => updateHeader(idx, 'value', e.target.value)}
                  placeholder="value"
                  className={`flex-1 ${inputCls} font-mono`}
                />
                <button
                  type="button"
                  onClick={() => removeHeader(idx)}
                  className="text-red-500 hover:text-red-400 text-xs px-1"
                  title="Remove header"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-gray-200">Body</p>
          <div className="flex items-center gap-2">
            {bodyPrettyError && <span className="text-xs text-red-400">{bodyPrettyError}</span>}
            <button
              type="button"
              onClick={prettifyBody}
              className="rounded px-2 py-0.5 text-xs text-indigo-400 hover:bg-gray-800 hover:text-indigo-300"
              title="Pretty-print JSON"
            >
              {} Prettify
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-700 focus-within:border-indigo-500 transition min-h-[140px] [&_.cm-editor]:rounded-lg [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-xs">
          <CodeMirror
            value={parts.body}
            onChange={setBody}
            extensions={[json(), bracketMatching(), lineNumbers()]}
            theme={oneDark}
            basicSetup={{
              lineNumbers: false,
              bracketMatching: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightSelectionMatches: false,
            }}
            placeholder='{"key": "value"}'
            minHeight="140px"
          />
        </div>
      </div>

      {/* Reconstructed curl preview */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400">
          ▶ View raw cURL template
        </summary>
        <pre className="mt-1.5 overflow-x-auto rounded-lg bg-gray-950 p-2 text-xs text-gray-400">
          {buildCurlFromParts(parts)}
        </pre>
      </details>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toFormState(step: Step): FormState {
  return {
    name: step.name,
    type: step.type,
    curl_template: step.curl_template,
    transform_code:
      step.type === 'condition'
        ? step.transform_code || DEFAULT_CONDITION_CODE
        : step.transform_code || DEFAULT_TRANSFORM_CODE,
    cache_enabled: step.cache_enabled === 1,
    cache_ttl: step.cache_ttl,
  };
}

function isDirty(step: Step, form: FormState) {
  return (
    step.name !== form.name ||
    step.type !== form.type ||
    step.curl_template !== form.curl_template ||
    step.transform_code !== form.transform_code ||
    step.cache_enabled !== (form.cache_enabled ? 1 : 0) ||
    step.cache_ttl !== form.cache_ttl
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function StepEditPanel(props: StepEditPanelProps) {
  if (!props.step) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-950/50 p-6 text-center text-sm text-gray-500">
        Select a node to edit its details.
      </div>
    );
  }

  return <StepEditPanelContent key={props.step.id} {...props} step={props.step} />;
}

function StepEditPanelContent({
  step,
  envVariables,
  availableStepRefs,
  onSave,
  onDelete,
  onDuplicate,
  onRunStep,
  running = false,
  busy = false,
}: Omit<StepEditPanelProps, 'step'> & { step: Step }) {
  const [form, setForm] = useState<FormState>(() => toFormState(step));
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [runningStep, setRunningStep] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep refs so the debounced save always sees the latest values without stale closures.
  const formRef = useRef(form);
  formRef.current = form;
  const stepRef = useRef(step);
  stepRef.current = step;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const hasChanges = isDirty(step, form);

  const persist = useCallback(async (nextForm?: FormState) => {
    const currentForm = nextForm ?? formRef.current;
    const currentStep = stepRef.current;
    if (!isDirty(currentStep, currentForm)) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await onSaveRef.current(currentStep.id, {
        name: currentForm.name.trim() || currentStep.name,
        type: currentForm.type,
        curl_template: currentForm.curl_template,
        transform_code:
          currentForm.type === 'transform'
            ? currentForm.transform_code || DEFAULT_TRANSFORM_CODE
            : currentForm.type === 'condition'
              ? currentForm.transform_code || DEFAULT_CONDITION_CODE
              : currentForm.transform_code,
        cache_enabled: currentForm.cache_enabled ? 1 : 0,
        cache_ttl: currentForm.cache_ttl,
      });
      setForm(toFormState(updated));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save step');
    } finally {
      setSaving(false);
    }
  }, []); // stable — reads from refs at call time

  // Debounced auto-save: fires 600ms after the last form change.
  // Skips the very first render (form === step, isDirty = false anyway).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty(step, form)) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persist(), 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete ${step.name}?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onDelete(step.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete step');
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    setError(null);
    try {
      await onDuplicate(step.id);
    } catch (dupError) {
      setError(dupError instanceof Error ? dupError.message : 'Failed to duplicate step');
    } finally {
      setDuplicating(false);
    }
  };

  const handleRunStep = async () => {
    if (!onRunStep) {
      return;
    }

    setRunningStep(true);
    setError(null);
    try {
      await onRunStep(step.id);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run step');
    } finally {
      setRunningStep(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-800 bg-gray-950/70 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step details</p>
          <h2 className="text-lg font-semibold text-white">{step.name}</h2>
        </div>
        <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">#{step.order_index + 1}</span>
      </div>

      <div className="space-y-4 overflow-y-auto pr-1">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Step name</span>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-gray-200">Type</span>
          <select
            value={form.type}
            onChange={(event) => {
              const nextType = event.target.value as StepType;
              setForm((current) => ({
                ...current,
                type: nextType,
                transform_code:
                  nextType === 'transform'
                    ? current.transform_code || DEFAULT_TRANSFORM_CODE
                    : nextType === 'condition'
                      ? current.transform_code || DEFAULT_CONDITION_CODE
                      : current.transform_code,
              }));
            }}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
          >
            <option value="curl">curl</option>
            <option value="transform">transform</option>
            <option value="condition">condition</option>
          </select>
        </label>

        {form.type === 'curl' ? (
          <CurlEditor
            curlTemplate={form.curl_template}
            onChange={(next) =>
              setForm((current) => ({ ...current, curl_template: next }))
            }
          />
        ) : form.type === 'condition' ? (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-200">Condition code</span>
            <div className="overflow-hidden rounded-lg border border-gray-700 focus-within:border-amber-500 transition [&_.cm-editor]:rounded-lg [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-xs">
              <CodeMirror
                value={form.transform_code}
                onChange={(code) =>
                  setForm((current) => ({ ...current, transform_code: code }))
                }
                extensions={[javascript(), bracketMatching(), lineNumbers()]}
                theme={oneDark}
                basicSetup={{
                  lineNumbers: false,
                  bracketMatching: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                  highlightSelectionMatches: false,
                }}
                minHeight="180px"
              />
            </div>
            <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
              Return <code className="font-bold">true</code> → ✓ true branch runs.{' '}
              Return <code className="font-bold">false</code> → ✗ false branch runs.
              <br />
              Available: <code>context.env</code>, <code>context.steps.StepName.status</code>, <code>context.steps.StepName.bodyParsed</code>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-200">Transform code</span>
            <div className="overflow-hidden rounded-lg border border-gray-700 focus-within:border-purple-500 transition [&_.cm-editor]:rounded-lg [&_.cm-editor.cm-focused]:outline-none [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-xs">
              <CodeMirror
                value={form.transform_code}
                onChange={(code) =>
                  setForm((current) => ({ ...current, transform_code: code }))
                }
                extensions={[javascript(), bracketMatching(), lineNumbers()]}
                theme={oneDark}
                basicSetup={{
                  lineNumbers: false,
                  bracketMatching: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                  highlightSelectionMatches: false,
                }}
                minHeight="220px"
              />
            </div>
          </div>
        )}

        {form.type === 'transform' && (
          <div className="rounded-lg border border-purple-900/60 bg-purple-950/20 p-3 text-xs text-purple-200">
            Available in code: <code>context.env</code>, <code>context.steps.StepName.bodyParsed</code>, or use <code>{'{{steps.StepName.body.field}}'}</code> interpolation.
          </div>
        )}

        {form.type === 'curl' && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-800 bg-gray-900/70 p-3">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={form.cache_enabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, cache_enabled: event.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-indigo-500 focus:ring-indigo-500"
              />
              Cache enabled
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-gray-200">TTL (seconds)</span>
              <input
                type="number"
                min={1}
                value={form.cache_ttl}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    cache_ttl: Number(event.target.value) || 1,
                  }))
                }
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none transition focus:border-indigo-500"
              />
            </label>
          </div>
        )}

        <VariableHelper envVariables={envVariables} previousStepNames={availableStepRefs} />

        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-xs text-gray-500">
          {saving ? 'Saving…' : hasChanges ? 'Unsaved changes (auto-saving…)' : '✓ Saved'}
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        {onRunStep && (
          <button
            type="button"
            onClick={() => void handleRunStep()}
            disabled={saving || duplicating || runningStep || running || busy}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runningStep || running ? '⏳ Running…' : '▶ Run Step'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleDuplicate()}
          disabled={saving || duplicating || runningStep || running || busy}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {duplicating ? 'Duplicating…' : '⧉ Duplicate'}
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={saving || duplicating || runningStep || running || busy}
          className="flex-1 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
