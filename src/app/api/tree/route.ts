import { getTree } from '@/lib/db';

export async function GET() {
  return Response.json(getTree());
}
