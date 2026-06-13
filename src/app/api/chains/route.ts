import { z } from 'zod';

import { createChain, listChains } from '@/lib/db';

const createChainSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().default(''),
  environment_id: z.string().nullable().optional(),
});

export async function GET() {
  return Response.json(listChains());
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = createChainSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  const chain = createChain(result.data);
  return Response.json(chain, { status: 201 });
}
