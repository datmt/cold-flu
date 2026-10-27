'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { bracketMatching } from '@codemirror/language';
import { lineNumbers } from '@codemirror/view';

import RequestEditor from '@/components/RequestEditor';
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
          <RequestEditor
            curlTemplate={form.curl_template}
            envVariables={envVariables}
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

        <VariableHelper envVariables={envVariables} previousStepNames={availableStepRefs} currentStepName={form.name.trim()} />

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
