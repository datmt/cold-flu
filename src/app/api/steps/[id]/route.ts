import { z } from 'zod';

import { deleteStep, getStep, updateStep } from '@/lib/db';

const cacheEnabledSchema = z.union([z.boolean(), z.literal(0), z.literal(1)]);

const updateStepSchema = z.object({
  name: z.string().trim().min(1).optional(),
  curl_template: z.string().optional(),
  transform_code: z.string().optional(),
  type: z.enum(['curl', 'transform', 'condition']).optional(),
  cache_enabled: cacheEnabledSchema.optional(),
  cache_ttl: z.number().int().min(1).optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
});

function normalizeCacheEnabled(value: boolean | 0 | 1 | undefined) {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const step = getStep(id);

  if (!step) {
    return Response.json({ error: 'Step not found' }, { status: 404 });
  }

  return Response.json(step);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = updateStepSchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: result.error.flatten() }, { status: 400 });
    }

    const step = updateStep(id, {
      ...result.data,
      cache_enabled: normalizeCacheEnabled(result.data.cache_enabled),
    });

    if (!step) {
      return Response.json({ error: 'Step not found' }, { status: 404 });
    }

    return Response.json(step);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update step';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteStep(id);

  if (!deleted) {
    return Response.json({ error: 'Step not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
