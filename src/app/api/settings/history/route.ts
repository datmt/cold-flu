import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJsonBody } from "@/lib/api";
import { getRetention, setRetention } from "@/lib/db";

export async function GET() {
  try {
    return NextResponse.json(getRetention());
  } catch (error) {
    return jsonError(error);
  }
}

// 0 = unlimited
const count = z.number().int().min(0);
const updateSchema = z.object({
  maxRunsPerChain: count,
  maxLoadTestsPerChain: count,
  maxAgeDays: count,
  maxBodyBytes: count,
});

export async function PUT(request: Request) {
  try {
    const result = updateSchema.safeParse(await readJsonBody<unknown>(request));
    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }
    setRetention(result.data);
    return NextResponse.json(result.data);
  } catch (error) {
    return jsonError(error);
  }
}
