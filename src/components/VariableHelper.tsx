'use client';

const HELPER_VARS = ['$uuid', '$timestamp', '$isoDate', '$random'];

interface VariableHelperProps {
  envVariables: string[];
  previousStepNames: string[];
}

function Chip({ label }: { label: string }) {
  return <code className="rounded bg-gray-800 px-2 py-1 text-xs text-indigo-200">{label}</code>;
}

export default function VariableHelper({ envVariables, previousStepNames }: VariableHelperProps) {
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
