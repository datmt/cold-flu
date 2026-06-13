import { z } from 'zod';

import { createStep } from '@/lib/db';
import { DEFAULT_CONDITION_CODE, DEFAULT_TRANSFORM_CODE } from '@/lib/steps';

const cacheEnabledSchema = z.union([z.boolean(), z.literal(0), z.literal(1)]);

const createStepSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['curl', 'transform', 'condition']).default('curl'),
  curl_template: z.string().optional(),
  transform_code: z.string().optional(),
  cache_enabled: cacheEnabledSchema.optional(),
  cache_ttl: z.number().int().min(1).optional(),
  order_index: z.number().int().min(0).optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
});

function normalizeCacheEnabled(value: boolean | 0 | 1 | undefined) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return value;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = createStepSchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: result.error.flatten() }, { status: 400 });
    }

    const step = createStep({
      chain_id: id,
      ...result.data,
      cache_enabled: normalizeCacheEnabled(result.data.cache_enabled),
      transform_code:
        result.data.type === 'transform'
          ? result.data.transform_code ?? DEFAULT_TRANSFORM_CODE
          : result.data.type === 'condition'
            ? result.data.transform_code ?? DEFAULT_CONDITION_CODE
            : result.data.transform_code ?? '',
    });

    return Response.json(step, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create step';
    return Response.json({ error: message }, { status: 400 });
  }
}
