'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

export function TransformNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    executing?: boolean;
    runStatus?: 'completed' | 'failed' | 'running' | 'stale' | null;
  };

  const glowClass = nodeData.executing
    ? 'border-purple-400 shadow-[0_0_16px_4px_rgba(168,85,247,0.7)] animate-pulse'
    : nodeData.runStatus === 'completed'
      ? 'border-green-500 shadow-[0_0_12px_3px_rgba(34,197,94,0.5)]'
      : nodeData.runStatus === 'failed'
        ? 'border-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.5)]'
        : nodeData.runStatus === 'stale'
          ? 'border-slate-700 opacity-60'
          : selected
            ? 'border-purple-500'
            : 'border-purple-900';

  return (
    <div className={`min-w-[160px] rounded-xl border-2 bg-gray-900 px-4 py-3 shadow-lg transition-all ${glowClass}`}>
      <Handle type="target" position={Position.Left} className="!bg-purple-500" />
      <div className="flex items-center gap-2">
        <span className="text-lg">⚙️</span>
        <span className="max-w-[120px] truncate text-sm font-semibold text-gray-100">{String(nodeData.label ?? '')}</span>
      </div>
      <span className="font-mono text-xs text-purple-400">JS Transform</span>
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />
    </div>
  );
}
