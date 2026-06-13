import { exportChain } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = exportChain(id);

  if (!payload) {
    return Response.json({ error: 'Chain not found' }, { status: 404 });
  }

  const filename = `${payload.name.replace(/[^a-z0-9_-]/gi, '_') || 'chain'}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
