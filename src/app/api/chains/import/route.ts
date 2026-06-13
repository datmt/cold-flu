import { z } from 'zod';

import { importChain } from '@/lib/db';

const stepSchema = z.object({
  ref: z.string(),
  name: z.string().trim().min(1),
  type: z.enum(['curl', 'transform']),
  curl_template: z.string().default(''),
  transform_code: z.string().default(''),
  cache_enabled: z.number().int().default(0),
  cache_ttl: z.number().int().default(3600),
  position_x: z.number().default(0),
  position_y: z.number().default(0),
  depends_on: z.array(z.string()).default([]),
});

const importSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1),
  description: z.string().default(''),
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
