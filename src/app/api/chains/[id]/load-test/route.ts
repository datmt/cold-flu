import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api';
import { getChain } from '@/lib/db';
import { startLoadTest } from '@/lib/executor/load-test';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chain = getChain(id);
    if (!chain) {
      return NextResponse.json({ error: 'Chain not found' }, { status: 404 });
    }

    const body = (await request.json()) as unknown;
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { total, concurrency } = body as Record<string, unknown>;

    const parsedTotal = Number(total);
    const parsedConcurrency = Number(concurrency);

    if (!Number.isInteger(parsedTotal) || parsedTotal < 1) {
      return NextResponse.json({ error: '`total` must be a positive integer' }, { status: 400 });
    }
    if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1) {
      return NextResponse.json({ error: '`concurrency` must be a positive integer' }, { status: 400 });
    }
    if (parsedConcurrency > parsedTotal) {
      return NextResponse.json({ error: '`concurrency` cannot exceed `total`' }, { status: 400 });
    }

    const loadTestId = startLoadTest(id, parsedTotal, parsedConcurrency);
    return NextResponse.json({ loadTestId });
  } catch (error) {
    return jsonError(error);
  }
}
