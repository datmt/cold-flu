import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api';
import { getLoadTest, listLoadTestRuns } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const loadTest = getLoadTest(id);

    if (!loadTest) {
      return NextResponse.json({ error: 'Load test not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get('runs') === '1') {
      const runs = listLoadTestRuns(id);
      return NextResponse.json({ ...loadTest, runs });
    }

    return NextResponse.json(loadTest);
  } catch (error) {
    return jsonError(error);
  }
}
