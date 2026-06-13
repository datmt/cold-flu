import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { clearStepCache } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    clearStepCache(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
