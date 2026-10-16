import 'server-only';
import { z } from 'zod';
import { adminImageField, adminImagePatchSchema, getAdminResource, resourceSchema, sessionSpeakerIdsSchema, type AdminResource } from '../admin-resources';
import { uuid } from '../validation';
import type { serverSupabase } from '../supabase/server';
import { ApiError, databaseError, handle, json, parseBody } from './http';

type Actor = { db: NonNullable<Awaited<ReturnType<typeof serverSupabase>>>; event: { id: string } };
type Context = { params: Promise<{ resource: string }> };
interface Options {
  authorize: () => Promise<Actor>;
  invalidate: () => void;
  definition?: (key: string) => AdminResource | null;
  demoRows?: (key: string) => Record<string, unknown>[] | null;
  updateSingleton?: boolean;
}
/** Both organizer experiences use the same validation and transactional writes. */
export function contentActions(options: Options) {
  const definition = (resource: string) => {
    const value = (options.definition ?? getAdminResource)(resource);
    if (!value) throw new ApiError(404, 'This organizer section does not exist.');
    return value;
  };
  return {
    GET: (request: Request, context: Context) => handle(async () => {
      const { resource } = await context.params;
      const spec = definition(resource);
      const demo = options.demoRows?.(resource);
      if (demo) return json({ rows: demo, hasMore: false });
      const { db, event } = await options.authorize();
      const rawOffset = Number(new URL(request.url).searchParams.get('offset'));
      const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.min(Math.floor(rawOffset), 10000)) : 0;
      const result = await db.from(resource).select('*').eq('event_id', event.id).order(spec.order, { ascending: resource !== 'announcements' }).range(offset, offset + 50);
      databaseError(result.error);
      let rows = (result.data ?? []).slice(0, 50);
      if (resource === 'agenda_sessions' && rows.length) {
        const sessionIds = rows.map(row => row.id);
        const [notes, links] = await Promise.all([
          db.from('agenda_import_notes').select('session_id,source_sheet,source_row,issue,review_status').eq('event_id', event.id).in('session_id', sessionIds),
          db.from('session_speakers').select('session_id,speaker_id').eq('event_id', event.id).in('session_id', sessionIds),
        ]);
        databaseError(notes.error); databaseError(links.error);
        rows = rows.map(row => ({ ...row, import_note: notes.data?.find(note => note.session_id === row.id) ?? null, speaker_ids: (links.data ?? []).filter(link => link.session_id === row.id).map(link => link.speaker_id) }));
      }
      return json({ rows, hasMore: (result.data?.length ?? 0) > 50 });
    }),
    POST: (request: Request, context: Context) => handle(async () => {
      const { resource } = await context.params;
      const spec = definition(resource);
      const body = await parseBody(request, z.object({ id: uuid.optional(), values: resourceSchema(spec), speaker_ids: resource === 'agenda_sessions' ? sessionSpeakerIdsSchema.optional() : z.never().optional() }).strict());
      const { db, event } = await options.authorize();
      if (resource === 'agenda_sessions' && body.speaker_ids !== undefined) {
        const result = await db.rpc('admin_save_agenda_session', { p_event: event.id, p_session: body.id ?? null, p_values: body.values, p_speaker_ids: body.speaker_ids });
        databaseError(result.error);
        if (!result.data) throw new ApiError(404, 'This session was changed or removed. Refresh the section and try again.');
        options.invalidate();
        return json({ saved: true, record: { id: result.data } });
      }
      const query = spec.singleton
        ? options.updateSingleton ? db.from(resource).update(body.values).eq('event_id', event.id) : db.from(resource).upsert({ ...body.values, event_id: event.id })
        : body.id ? db.from(resource).update(body.values).eq('event_id', event.id).eq('id', body.id) : db.from(resource).insert({ ...body.values, event_id: event.id });
      const result = await query.select(spec.singleton ? 'event_id' : 'id').maybeSingle();
      databaseError(result.error);
      if (!result.data) throw new ApiError(404, 'This record was changed or removed. Refresh the section and try again.');
      options.invalidate();
      return json({ saved: true, record: result.data });
    }),
    PATCH: (request: Request, context: Context) => handle(async () => {
      const { resource } = await context.params;
      const spec = (options.definition ?? getAdminResource)(resource);
      const imageField = spec && adminImageField(spec);
      if (!imageField) throw new ApiError(400, 'This section does not support a list image upload.');
      const body = await parseBody(request, adminImagePatchSchema);
      const { db, event } = await options.authorize();
      const result = await db.from(resource).update({ [imageField.key]: body.url }).eq('event_id', event.id).eq('id', body.id).select('id').maybeSingle();
      databaseError(result.error);
      if (!result.data) throw new ApiError(404, 'This record was changed or removed. Refresh the section and try again.');
      options.invalidate();
      return json({ saved: true, record: result.data });
    }),
    DELETE: (request: Request, context: Context) => handle(async () => {
      const { resource } = await context.params;
      const spec = (options.definition ?? getAdminResource)(resource);
      if (!spec || spec.singleton) throw new ApiError(400, 'This section cannot be deleted.');
      const body = await parseBody(request, z.object({ id: uuid }).strict());
      const { db, event } = await options.authorize();
      const result = await db.from(resource).delete().eq('event_id', event.id).eq('id', body.id).select('id').maybeSingle();
      databaseError(result.error);
      if (!result.data) throw new ApiError(404, 'This record has already been removed.');
      options.invalidate();
      return json({ deleted: true });
    }),
  };
}
