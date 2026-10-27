import yaml from 'js-yaml';
import { z } from 'zod';

import { createChain, createEnvironment, createFolder, createStep } from '@/lib/db';
import { openApiToRequests } from '@/lib/openapi';

const bodySchema = z.object({ spec: z.string().min(1) });

export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return Response.json({ error: 'Body must be { spec: string }' }, { status: 400 });

  let imported;
  try {
    // YAML is a JSON superset, so one loader handles both.
    imported = openApiToRequests(yaml.load(parsedBody.data.spec));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Invalid spec' }, { status: 400 });
  }

  const environment = createEnvironment({ name: `${imported.title} (OpenAPI)`, variables: imported.env });
  const folderByTag = new Map<string, string>();
  const chainIds: string[] = [];

  for (const r of imported.requests) {
    let folder_id: string | null = null;
    if (r.tag) {
      if (!folderByTag.has(r.tag)) folderByTag.set(r.tag, createFolder({ name: r.tag }).id);
      folder_id = folderByTag.get(r.tag)!;
    }
    const chain = createChain({ name: r.name, description: r.description, mode: 'simple', environment_id: environment.id, folder_id });
    createStep({ chain_id: chain.id, name: r.name, type: 'curl', curl_template: r.curl });
    chainIds.push(chain.id);
  }

  return Response.json({ environment_id: environment.id, chain_ids: chainIds, folders: folderByTag.size }, { status: 201 });
}
