import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api';
import { getLoadTest } from '@/lib/db';
import { requestCancelLoadTest } from '@/lib/executor/load-test';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const loadTest = getLoadTest(id);

    if (!loadTest) {
      return NextResponse.json({ error: 'Load test not found' }, { status: 404 });
    }

    if (loadTest.status !== 'running') {
      return NextResponse.json({ error: 'Load test is not running' }, { status: 409 });
    }

    requestCancelLoadTest(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
