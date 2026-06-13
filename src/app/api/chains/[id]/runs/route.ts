import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { getChain, listRunsForChain } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const chain = getChain(id);
    if (!chain) {
      return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    }

    return NextResponse.json(listRunsForChain(id));
  } catch (error) {
    return jsonError(error);
  }
}
