import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError, readJsonBody } from "@/lib/api";
import { deleteEnvironment, getEnvironment, updateEnvironment } from "@/lib/db";

const environmentUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  functions: z.string().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const environment = getEnvironment(id);

    if (!environment) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }

    return NextResponse.json(environment);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await readJsonBody<unknown>(request);
    const result = environmentUpdateSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
    }

    const environment = updateEnvironment(id, result.data);
    if (!environment) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }

    return NextResponse.json(environment);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deleted = deleteEnvironment(id);

    if (!deleted) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
