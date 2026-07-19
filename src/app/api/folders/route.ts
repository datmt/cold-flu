import { z } from 'zod';

import { createFolder, listFolders } from '@/lib/db';

const createFolderSchema = z.object({
  name: z.string().trim().min(1),
  parent_id: z.string().nullable().optional(),
});

export async function GET() {
  return Response.json(listFolders());
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = createFolderSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  const folder = createFolder(result.data);
  return Response.json(folder, { status: 201 });
}
