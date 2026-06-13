import { z } from 'zod';

import { getChain, saveChainGraph } from '@/lib/db';

const graphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().trim().min(1),
      position: z.object({
        x: z.number(),
        y: z.number(),
      }),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string().trim().min(1),
      target: z.string().trim().min(1),
      sourceHandle: z.string().nullable().optional(),
    }),
  ),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const chain = getChain(id);

    if (!chain) {
      return Response.json({ error: 'Chain not found' }, { status: 404 });
    }

    const body = await request.json();
    const result = graphSchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: result.error.flatten() }, { status: 400 });
    }

    saveChainGraph(id, result.data.nodes, result.data.edges);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save graph';
    return Response.json({ error: message }, { status: 400 });
  }
}
