'use client';

import { useState } from 'react';

const HELPER_VARS = ['$uuid', '$timestamp', '$isoDate', '$random'];

interface VariableHelperProps {
  envVariables: string[];
  previousStepNames: string[];
  /** Live name of the step being edited, so its own output syntax tracks renames as you type. */
  currentStepName?: string;
}

function Chip({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(label).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }, () => {});
  };
  return (
    <button type="button" onClick={copy} title="Click to copy" className="cursor-pointer rounded bg-gray-800 px-2 py-1 text-left text-xs hover:bg-gray-700">
      <code className={copied ? 'text-emerald-300' : 'text-indigo-200'}>{copied ? 'Copied ✓' : label}</code>
    </button>
  );
}

export default function VariableHelper({ envVariables, previousStepNames, currentStepName }: VariableHelperProps) {
  const uniqueStepNames = [...new Set(previousStepNames.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/60 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Built-in helpers</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {HELPER_VARS.map((v) => <Chip key={v} label={`{{${v}}}`} />)}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Environment variables</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {envVariables.length > 0 ? (
            envVariables.map((name) => <Chip key={name} label={`{{env.${name}}}`} />)
          ) : (
            <span className="text-xs text-gray-500">No environment variables configured.</span>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Step outputs</p>
        <p className="mt-1 text-xs text-gray-600">Array items: <code className="text-indigo-300">{'{{steps.Name.body.list[0].field}}'}</code></p>
        <p className="mt-0.5 text-xs text-gray-600">Inline JS: <code className="text-indigo-300">{'{{= Math.round(Math.random()*100) }}'}</code></p>
        {currentStepName && (
          <>
            <p className="mt-2 text-xs text-gray-500">This step (use in later steps):</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {['body', 'status', 'headers'].map((f) => <Chip key={f} label={`{{steps.${currentStepName}.${f}}}`} />)}
            </div>
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {uniqueStepNames.length > 0 ? (
            uniqueStepNames.flatMap((name) => [
              <Chip key={`${name}-body`} label={`{{steps.${name}.body}}`} />,
              <Chip key={`${name}-status`} label={`{{steps.${name}.status}}`} />,
              <Chip key={`${name}-headers`} label={`{{steps.${name}.headers}}`} />,
            ])
          ) : (
            <span className="text-xs text-gray-500">No step outputs available yet.</span>
          )}
        </div>
      </div>
    </div>
  );
}
