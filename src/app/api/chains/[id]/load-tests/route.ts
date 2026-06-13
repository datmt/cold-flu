import { NextResponse } from 'next/server';

import { jsonError } from '@/lib/api';
import { getChain, listLoadTestsForChain } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chain = getChain(id);

    if (!chain) {
      return NextResponse.json({ error: 'Chain not found' }, { status: 404 });
    }

    const loadTests = listLoadTestsForChain(id);
    return NextResponse.json(loadTests);
  } catch (error) {
    return jsonError(error);
  }
}
