import { NextResponse } from "next/server";
import { deleteMemory, updateMemory } from "@/lib/personalized/memory";
import { resolveWritable } from "@/lib/personalized/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Both handlers pass the verified user id into the query alongside the id
   from the path. That pairing IS the ownership check: an id belonging to
   another account matches no row and answers 404 rather than mutating it. */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveWritable(request, "Updating a preference");
  if ("response" in resolved) return resolved.response;

  const { id } = await params;

  let body: { value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const updated = await updateMemory(resolved.session.userId, id, body.value);
  if (updated.error !== null) {
    return NextResponse.json(
      { error: updated.error },
      { status: updated.error === "Preference not found." ? 404 : 400 },
    );
  }
  return NextResponse.json({ memory: updated.memory });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveWritable(request, "Removing a preference");
  if ("response" in resolved) return resolved.response;

  const { id } = await params;
  const removed = await deleteMemory(resolved.session.userId, id);

  if (!removed) {
    return NextResponse.json({ error: "Preference not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
