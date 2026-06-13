import { NextResponse } from "next/server";

export function jsonError(error: unknown, fallback = "Internal server error", status = 500) {
  console.error(error);

  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}

export async function readJsonBody<T>(request: Request) {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
