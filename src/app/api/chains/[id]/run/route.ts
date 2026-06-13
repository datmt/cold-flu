import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { getChain } from "@/lib/db";
import { startChainExecution } from "@/lib/executor";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chain = getChain(id);
    if (!chain) {
      return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    }

    const runId = startChainExecution(id);
    return NextResponse.json({ runId });
  } catch (error) {
    return jsonError(error);
  }
}
