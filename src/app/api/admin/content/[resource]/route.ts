import { z } from "zod";
import { adminImageField, adminImagePatchSchema, getAdminResource, resourceSchema, sessionSpeakerIdsSchema } from "@/lib/admin-resources";
import { uuid } from "@/lib/validation";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo, invalidatePublicGuide } from "@/lib/server/guide";
import { demoResourceRows } from "@/lib/server/admin";
import { ApiError, databaseError, handle, json, parseBody } from "@/lib/server/http";

type Context = { params: Promise<{ resource: string }> };
export const GET = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  if (!definition) throw new ApiError(404, "This organizer section does not exist.");
  if (isDemo()) return json({ rows: demoResourceRows(resource), hasMore: false });
  const { db, event } = await requireAdmin();
  const offset = Math.max(0, Math.min(Number(new URL(request.url).searchParams.get("offset")) || 0, 10000));
  const result = await db.from(resource).select("*").eq("event_id", event.id).order(definition.order, { ascending: resource !== "announcements" }).range(offset, offset + 50);
  databaseError(result.error);
  let rows = (result.data ?? []).slice(0, 50);
  if (resource === 'agenda_sessions' && rows.length) {
    const sessionIds = rows.map(row => row.id);
    const [notes, links] = await Promise.all([
      db.from('agenda_import_notes').select('session_id,source_sheet,source_row,issue,review_status').eq('event_id', event.id).in('session_id', sessionIds),
      db.from('session_speakers').select('session_id,speaker_id').eq('event_id', event.id).in('session_id', sessionIds),
    ]);
    databaseError(notes.error);
    databaseError(links.error);
    rows = rows.map(row => ({ ...row, import_note: notes.data?.find(note => note.session_id === row.id) ?? null, speaker_ids: (links.data ?? []).filter(link => link.session_id === row.id).map(link => link.speaker_id) }));
  }
  return json({ rows, hasMore: (result.data?.length ?? 0) > 50 });
});
export const POST = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  if (!definition) throw new ApiError(404, "This organizer section does not exist.");
  const body = await parseBody(request, z.object({
    id: uuid.optional(), values: resourceSchema(definition),
    speaker_ids: resource === "agenda_sessions" ? sessionSpeakerIdsSchema.optional() : z.never().optional(),
  }).strict());
  const { db, event } = await requireAdmin();
  if (resource === "agenda_sessions" && body.speaker_ids !== undefined) {
    // A single transaction saves the session and its existing join-table links.
    // The RPC is SECURITY INVOKER: event RLS, audit and review triggers still run.
    const result = await db.rpc("admin_save_agenda_session", {
      p_event: event.id, p_session: body.id ?? null, p_values: body.values, p_speaker_ids: body.speaker_ids,
    });
    databaseError(result.error);
    if (!result.data) throw new ApiError(404, "This session was changed or removed. Refresh the section and try again.");
    invalidatePublicGuide();
    return json({ saved: true, record: { id: result.data } });
  }
  const query = definition.singleton
    ? db.from(resource).upsert({ ...body.values, event_id: event.id })
    : body.id ? db.from(resource).update(body.values).eq("event_id", event.id).eq("id", body.id)
    : db.from(resource).insert({ ...body.values, event_id: event.id });
  const result = await query.select(definition.singleton ? "event_id" : "id").maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This record was changed or removed. Refresh the section and try again.");
  invalidatePublicGuide();
  return json({ saved: true, record: result.data });
});

export const PATCH = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  const imageField = definition && adminImageField(definition);
  if (!imageField) throw new ApiError(400, "This section does not support a list image upload.");
  const body = await parseBody(request, adminImagePatchSchema);
  const { db, event } = await requireAdmin();
  const result = await db.from(resource).update({ [imageField.key]: body.url })
    .eq("event_id", event.id).eq("id", body.id).select("id").maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This record was changed or removed. Refresh the section and try again.");
  invalidatePublicGuide();
  return json({ saved: true, record: result.data });
});
export const DELETE = (request: Request, context: Context) => handle(async () => {
  const { resource } = await context.params;
  const definition = getAdminResource(resource);
  if (!definition || definition.singleton) throw new ApiError(400, "This section cannot be deleted.");
  const body = await parseBody(request, z.object({ id: uuid }).strict());
  const { db, event } = await requireAdmin();
  const result = await db.from(resource).delete().eq("event_id", event.id).eq("id", body.id).select("id").maybeSingle();
  databaseError(result.error);
  if (!result.data) throw new ApiError(404, "This record has already been removed.");
  invalidatePublicGuide();
  return json({ deleted: true });
});
