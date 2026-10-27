import { z } from 'zod';

import { importChain } from '@/lib/db';

const stepSchema = z.object({
  ref: z.string(),
  name: z.string().trim().min(1),
  type: z.enum(['curl', 'transform', 'condition']),
  curl_template: z.string().default(''),
  transform_code: z.string().default(''),
  cache_enabled: z.number().int().default(0),
  cache_ttl: z.number().int().default(3600),
  position_x: z.number().default(0),
  position_y: z.number().default(0),
  // v1: string refs. v2: { ref, handle }.
  depends_on: z
    .array(
      z.union([
        z.string().transform((ref) => ({ ref, handle: null })),
        z.object({ ref: z.string(), handle: z.string().nullable().default(null) }),
      ]),
    )
    .default([]),
});

const importSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]).transform(() => 2 as const),
  name: z.string().trim().min(1),
  description: z.string().default(''),
  mode: z.enum(['simple', 'chain']).default('chain'),
  steps: z.array(stepSchema).default([]),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = importSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  const chain = importChain(result.data);
  return Response.json(chain, { status: 201 });
}
