import { duplicateChain } from '@/lib/db';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chain = duplicateChain(id);

  if (!chain) {
    return Response.json({ error: 'Chain not found' }, { status: 404 });
  }

  return Response.json(chain, { status: 201 });
}
