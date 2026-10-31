import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { addNote, deleteNote, listNotes } from "@/server/services/member-notes";

const guardOptions = { allowedRoles: ["owner" as const, "manager" as const], requireTenant: true };

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest, props: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await props.params;
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listNotes(guard.ctx, membershipId) });
  } catch (err) {
    return failure("NOTES_LOAD_FAILED", err, "Couldn't load the notes");
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await props.params;
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const { body } = z.object({ body: z.string() }).parse(await request.json());
    return NextResponse.json({ data: await addNote(guard.ctx, membershipId, body) }, { status: 201 });
  } catch (err) {
    return failure("NOTE_ADD_FAILED", err, "Couldn't save the note");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await deleteNote(guard.ctx, z.string().uuid().parse(request.nextUrl.searchParams.get("id"))) });
  } catch (err) {
    return failure("NOTE_DELETE_FAILED", err, "Couldn't remove the note");
  }
}
