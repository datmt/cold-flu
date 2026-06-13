'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    executing?: boolean;
    runStatus?: 'completed' | 'failed' | 'running' | 'skipped' | 'stale' | null;
  };

  const glowClass = nodeData.executing
    ? 'border-amber-400 shadow-[0_0_16px_4px_rgba(251,191,36,0.7)] animate-pulse'
    : nodeData.runStatus === 'completed'
      ? 'border-green-500 shadow-[0_0_12px_3px_rgba(34,197,94,0.5)]'
      : nodeData.runStatus === 'failed'
        ? 'border-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.5)]'
        : nodeData.runStatus === 'skipped'
          ? 'border-gray-600 opacity-60'
          : nodeData.runStatus === 'stale'
            ? 'border-slate-700 opacity-60'
            : selected
              ? 'border-amber-500'
              : 'border-amber-800/70';

  return (
    <div className={`min-w-[170px] rounded-xl border-2 bg-gray-900 px-4 py-3 shadow-lg transition-all ${glowClass}`}>
      {/* Input */}
      <Handle type="target" position={Position.Left} className="!bg-amber-500" />

      <div className="flex items-center gap-2">
        <span className="text-lg">🔀</span>
        <span className="max-w-[120px] truncate text-sm font-semibold text-gray-100">
          {String(nodeData.label ?? '')}
        </span>
      </div>
      <span className="font-mono text-xs text-amber-400">Condition</span>

      {/* Branch labels */}
      <div className="mt-2 flex flex-col gap-1 items-end pr-1">
        <span className="rounded bg-green-900/70 px-1.5 py-0.5 text-[10px] font-bold text-green-300">✓ true</span>
        <span className="rounded bg-red-900/70 px-1.5 py-0.5 text-[10px] font-bold text-red-300">✗ false</span>
      </div>

      {/* True output — upper right */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '35%' }}
        className="!bg-green-500"
      />
      {/* False output — lower right */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '72%' }}
        className="!bg-red-500"
      />
    </div>
  );
}
