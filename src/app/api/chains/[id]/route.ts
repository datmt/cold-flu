import { z } from 'zod';

import { deleteChain, getChain, updateChain } from '@/lib/db';

const updateChainSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  environment_id: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const chain = getChain(id);

  if (!chain) {
    return Response.json({ error: 'Chain not found' }, { status: 404 });
  }

  return Response.json(chain);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const result = updateChainSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  const chain = updateChain(id, result.data);

  if (!chain) {
    return Response.json({ error: 'Chain not found' }, { status: 404 });
  }

  return Response.json(chain);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteChain(id);

  if (!deleted) {
    return Response.json({ error: 'Chain not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
