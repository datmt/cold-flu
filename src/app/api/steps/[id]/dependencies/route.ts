import { z } from 'zod';

import {
  addStepDependency,
  listStepDependencies,
  removeStepDependency,
} from '@/lib/db';

const dependencySchema = z.object({
  depends_on_step_id: z.string().trim().min(1),
  source_handle: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return Response.json({ dependencies: listStepDependencies(id) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = dependencySchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: result.error.flatten() }, { status: 400 });
    }

    return Response.json({
        dependencies: addStepDependency(id, result.data.depends_on_step_id, result.data.source_handle),
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add dependency';
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = dependencySchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: result.error.flatten() }, { status: 400 });
    }

    return Response.json({
      dependencies: removeStepDependency(id, result.data.depends_on_step_id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove dependency';
    return Response.json({ error: message }, { status: 400 });
  }
}
