import { z } from 'zod';

import { deleteFolder, updateFolder } from '@/lib/db';

const updateFolderSchema = z.object({
  name: z.string().trim().min(1).optional(),
  parent_id: z.string().nullable().optional(),
  order_index: z.number().int().min(0).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const result = updateFolderSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  const folder = updateFolder(id, result.data);

  if (!folder) {
    return Response.json({ error: 'Folder not found' }, { status: 404 });
  }

  return Response.json(folder);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = deleteFolder(id);

  if (!deleted) {
    return Response.json({ error: 'Folder not found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
