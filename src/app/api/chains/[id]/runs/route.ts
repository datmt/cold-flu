import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { getChain, listRunsForChain } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chain = getChain(id);
    if (!chain) {
      return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

    return NextResponse.json(listRunsForChain(id, limit, offset));
  } catch (error) {
    return jsonError(error);
  }
}
