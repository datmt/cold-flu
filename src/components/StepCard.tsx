'use client';

import type { Step } from '@/lib/types';

interface StepCardProps {
  step: Step;
}

export default function StepCard({ step }: StepCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-300">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{step.name}</p>
          <p className="text-xs text-gray-500">{step.type === 'transform' ? 'Transform step' : 'cURL step'}</p>
        </div>
        <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">#{step.order_index + 1}</span>
      </div>
    </div>
  );
}
