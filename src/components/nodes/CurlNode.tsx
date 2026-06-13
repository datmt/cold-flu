'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useState } from 'react';
import type { Step } from '@/lib/types';

export function CurlNode({ data, selected }: NodeProps) {
  const nodeData = data as {
    label?: string;
    method?: string;
    cacheEnabled?: boolean;
    executing?: boolean;
    runStatus?: 'completed' | 'failed' | 'running' | 'stale' | null;
    step?: Step;
  };

  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopyCurl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const curl = nodeData.step?.curl_template;
    if (!curl) return;
    try {
      await navigator.clipboard.writeText(curl);
    } catch {
      const el = document.createElement('textarea');
      el.value = curl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const glowClass = nodeData.executing
    ? 'border-indigo-400 shadow-[0_0_16px_4px_rgba(99,102,241,0.7)] animate-pulse'
    : nodeData.runStatus === 'completed'
      ? 'border-green-500 shadow-[0_0_12px_3px_rgba(34,197,94,0.5)]'
      : nodeData.runStatus === 'failed'
        ? 'border-red-500 shadow-[0_0_12px_3px_rgba(239,68,68,0.5)]'
        : nodeData.runStatus === 'stale'
          ? 'border-slate-700 opacity-60'
          : selected
            ? 'border-indigo-500'
            : 'border-gray-700';

  return (
    <div
      className={`relative min-w-[160px] rounded-xl border-2 bg-gray-900 px-4 py-3 shadow-lg transition-all ${glowClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} className="!bg-indigo-500" />
      <div className="flex items-center gap-2">
        <span className="text-lg">🌐</span>
        <span className="max-w-[120px] truncate text-sm font-semibold text-gray-100">{String(nodeData.label ?? '')}</span>
      </div>
      <div className="flex items-center gap-1">
        {nodeData.method ? (
          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 font-mono text-xs ${methodColor(String(nodeData.method))}`}>
            {String(nodeData.method)}
          </span>
        ) : null}
        {nodeData.cacheEnabled ? <span className="ml-1 text-xs text-yellow-400">💾</span> : null}
      </div>
      {(hovered || selected) && nodeData.step?.curl_template ? (
        <button
          onClick={(e) => void handleCopyCurl(e)}
          title="Copy cURL command"
          className="absolute right-2 top-2 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-200 transition hover:bg-indigo-600 hover:text-white"
        >
          {copied ? '✓' : '⧉'}
        </button>
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-indigo-500" />
    </div>
  );
}

function methodColor(method: string) {
  const map: Record<string, string> = {
    GET: 'bg-green-900 text-green-300',
    POST: 'bg-blue-900 text-blue-300',
    PUT: 'bg-yellow-900 text-yellow-300',
    DELETE: 'bg-red-900 text-red-300',
    PATCH: 'bg-purple-900 text-purple-300',
  };

  return map[method.toUpperCase()] ?? 'bg-gray-800 text-gray-300';
}
