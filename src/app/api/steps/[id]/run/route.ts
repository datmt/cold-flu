import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api';
import { getStep } from '@/lib/db';
import { startStepExecution } from '@/lib/executor';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const step = getStep(id);
    if (!step) {
      return NextResponse.json({ error: 'Step not found' }, { status: 404 });
    }

    const runId = startStepExecution(id);
    return NextResponse.json({ runId });
  } catch (error) {
    return jsonError(error);
  }
}
