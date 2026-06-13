import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJsonBody } from "@/lib/api";
import { getGlobalFunctions, setGlobalFunctions } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json({ functions: getGlobalFunctions() });
  } catch (error) {
    return jsonError(error);
  }
}

const updateSchema = z.object({
  functions: z.string(),
});

export async function PUT(request: Request) {
  try {
    const payload = await readJsonBody<unknown>(request);
    const result = updateSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    setGlobalFunctions(result.data.functions);
    return NextResponse.json({ functions: result.data.functions });
  } catch (error) {
    return jsonError(error);
  }
}
