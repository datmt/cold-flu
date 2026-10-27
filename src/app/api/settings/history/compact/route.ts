import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { compactHistoryDb } from "@/lib/db";

// Applies retention to every chain, then VACUUMs history.db.
export async function POST() {
  try {
    return NextResponse.json(compactHistoryDb());
  } catch (error) {
    return jsonError(error);
  }
}
