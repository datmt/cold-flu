import { z } from 'zod';

import { createEnvironment, listEnvironments } from '@/lib/db';

const createEnvironmentSchema = z.object({
  name: z.string().trim().min(1),
  variables: z.record(z.string(), z.string()).default({}),
  functions: z.string().default(''),
});

export async function GET() {
  return Response.json(listEnvironments());
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = createEnvironmentSchema.safeParse(body);

  if (!result.success) {
    return Response.json({ error: result.error.flatten() }, { status: 400 });
  }

  const environment = createEnvironment(result.data);
  return Response.json(environment, { status: 201 });
}
