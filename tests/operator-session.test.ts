import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";

const speaker = "70000000-0000-4000-8000-000000000001";
const draftSpeaker = "70000000-0000-4000-8000-000000000002";
const foreignSpeaker = "70000000-0000-4000-8000-000000000003";
const values = { day_id: ids.day, title: "Updated workshop", description: "Organizer-approved description", starts_at: "2026-10-08T14:15:00Z", ends_at: "2026-10-08T15:15:00Z", room: "Hall A", session_type: "Workshop", sponsor_id: null, published: true, is_demo: false };

describe("atomic event-scoped operator session save", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase({ hostedFunctionGrants: true });
    await seedSecurityFixture(db);
    await db.query("update public.attendees set access_role='sponsor' where id=$1", [ids.bobAttendee]);
    await db.query("insert into public.speakers(id,event_id,full_name,published) values($1,$2,'Published Speaker',true),($3,$2,'Draft Speaker',false),($4,$5,'Other Event Speaker',true)", [speaker, ids.event, draftSpeaker, foreignSpeaker, ids.otherEvent]);
  });
  beforeEach(async () => {
    await db.query("delete from public.agenda_import_notes where event_id=$1", [ids.event]);
    await db.query("delete from public.session_speakers where event_id=$1", [ids.event]);
    await db.query("update public.agenda_sessions set title='Original session',published=true where id=$1", [ids.session]);
    await db.query("insert into public.session_speakers(event_id,session_id,speaker_id) values($1,$2,$3)", [ids.event, ids.session, speaker]);
  });
  afterAll(async () => { await db?.close(); });
  const save = (speakers: string[] | null = [speaker], overrides = {}, session: string | null = ids.session, event = ids.event) =>
    db.query<{ id: string }>("select public.admin_save_agenda_session($1,$2,$3,$4) as id", [event, session, JSON.stringify({ ...values, ...overrides }), speakers]);

  it("is invoker-scoped and not callable by anon despite hosted default grants", async () => {
    const result = await db.query("select prosecdef,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated from pg_proc where proname='admin_save_agenda_session'");
    expect(result.rows).toEqual([{ prosecdef: false, anon: false, authenticated: true }]);
    await asUser(db, null, async () => { await expect(save()).rejects.toThrow(/permission denied/); });
  });
  it("denies members, sponsors, unclaimed accounts and admins of other events", async () => {
    for (const user of [ids.alice, ids.bob, ids.unverified, ids.outsider]) {
      await asUser(db, user, async () => { await expect(save()).rejects.toThrow(/Organizer access/); });
    }
    await asUser(db, ids.admin, async () => { await expect(save([speaker], {}, ids.session, ids.otherEvent)).rejects.toThrow(/Organizer access/); });
    expect((await db.query("select title from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: "Original session" }]);
  });
  it("accepts an approved roster Admin and immediately refuses that account when access is disabled", async () => {
    await db.query("update public.attendees set access_role='admin' where id=$1", [ids.aliceAttendee]);
    try {
      await asUser(db, ids.alice, () => save([speaker]));
      expect((await db.query("select title from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: values.title }]);
      await db.query("update public.attendees set status='disabled' where id=$1", [ids.aliceAttendee]);
      await asUser(db, ids.alice, async () => { await expect(save([], { title: "Refused disabled edit" })).rejects.toThrow(/Organizer access/); });
      expect((await db.query("select title from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: values.title }]);
    } finally {
      await db.query("update public.attendees set access_role='member',status='approved' where id=$1", [ids.aliceAttendee]);
    }
  });
  it("saves title, event-zone instants and speaker additions together and retains existing link identity", async () => {
    const priorLink = (await db.query("select id from public.session_speakers where session_id=$1", [ids.session])).rows[0];
    await asUser(db, ids.admin, () => save([speaker, draftSpeaker, speaker]));
    expect((await db.query("select title,room,session_type from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: values.title, room: "Hall A", session_type: "Workshop" }]);
    expect((await db.query("select id from public.session_speakers where session_id=$1 and speaker_id=$2", [ids.session, speaker])).rows[0]).toEqual(priorLink);
    expect((await db.query("select * from public.session_speakers where session_id=$1", [ids.session])).rows).toHaveLength(2);
    expect((await db.query("select * from public.audit_log where actor_user_id=$1 and action='session_speakers.insert'", [ids.admin])).rows.length).toBeGreaterThan(0);
  });
  it("supports retry, removal and clearing without duplicate assignments", async () => {
    await asUser(db, ids.admin, async () => {
      await save([speaker, draftSpeaker]); await save([speaker, draftSpeaker]);
      expect((await db.query("select speaker_id from public.session_speakers where session_id=$1", [ids.session])).rows).toHaveLength(2);
      await save([draftSpeaker]);
      expect((await db.query("select speaker_id from public.session_speakers where session_id=$1", [ids.session])).rows).toEqual([{ speaker_id: draftSpeaker }]);
      await save([]);
      expect((await db.query("select * from public.session_speakers where session_id=$1", [ids.session])).rows).toHaveLength(0);
    });
  });
  it("creates a new session and its links in the same transaction", async () => {
    const result = await asUser(db, ids.admin, () => save([speaker], { published: false }, null));
    const id = result.rows[0].id;
    expect(id).not.toBe(ids.session);
    expect((await db.query("select speaker_id from public.session_speakers where session_id=$1", [id])).rows).toEqual([{ speaker_id: speaker }]);
    await db.query("delete from public.agenda_sessions where id=$1", [id]);
  });
  it("rejects foreign/missing speakers without changing content or existing links", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(save([foreignSpeaker])).rejects.toThrow(/speaker.*event/);
      await expect(save([ids.outsider])).rejects.toThrow(/speaker.*event/);
    });
    expect((await db.query("select title from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: "Original session" }]);
    expect((await db.query("select speaker_id from public.session_speakers where session_id=$1", [ids.session])).rows).toEqual([{ speaker_id: speaker }]);
  });
  it("rejects missing records, forged fields, null speaker arrays and invalid times", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(save([speaker], {}, ids.outsider)).rejects.toThrow(/session.*event/);
      await expect(save([speaker], { event_id: ids.otherEvent })).rejects.toThrow(/editable session fields/);
      await expect(save(null)).rejects.toThrow(/speakers/);
      await expect(save([speaker], { ends_at: values.starts_at })).rejects.toThrow(/End time must be after start time/);
      await expect(save([speaker], { day_id: ids.otherDay })).rejects.toThrow();
    });
    expect((await db.query("select title from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: "Original session" }]);
  });
  it("rolls back the session update and link deletion if the final link insert fails", async () => {
    await db.exec(`create function public.test_operator_link_failure() returns trigger language plpgsql as $$ begin if new.speaker_id='${draftSpeaker}'::uuid then raise exception 'Synthetic link failure'; end if; return new; end $$;
      create trigger test_operator_link_failure before insert on public.session_speakers for each row execute function public.test_operator_link_failure();`);
    try {
      await asUser(db, ids.admin, async () => { await expect(save([draftSpeaker])).rejects.toThrow(/Synthetic link failure/); });
      expect((await db.query("select title from public.agenda_sessions where id=$1", [ids.session])).rows).toEqual([{ title: "Original session" }]);
      expect((await db.query("select speaker_id from public.session_speakers where session_id=$1", [ids.session])).rows).toEqual([{ speaker_id: speaker }]);
    } finally {
      await db.exec("drop trigger test_operator_link_failure on public.session_speakers; drop function public.test_operator_link_failure();");
    }
  });
  it("keeps draft speakers, draft sessions and their links out of the anonymous guide read model", async () => {
    await asUser(db, ids.admin, () => save([speaker, draftSpeaker]));
    await asUser(db, null, async () => {
      expect((await db.query("select id from public.speakers")).rows).toEqual([{ id: speaker }]);
      expect((await db.query("select speaker_id from public.session_speakers")).rows).toEqual([{ speaker_id: speaker }]);
    });
    await asUser(db, ids.admin, () => save([speaker], { published: false }));
    await asUser(db, null, async () => {
      expect((await db.query("select id from public.agenda_sessions")).rows).toHaveLength(0);
      expect((await db.query("select * from public.session_speakers")).rows).toHaveLength(0);
    });
  });
  it("preserves the existing reviewed-session reopen trigger", async () => {
    await db.query("insert into public.agenda_import_notes(event_id,session_id,source_sheet,source_row,issue) values($1,$2,'Day 1',1,'Confirm session time')", [ids.event, ids.session]);
    await asUser(db, ids.admin, async () => {
      await db.query("select public.record_agenda_review($1,$2,'confirmed','Organizer confirmed the time',0)", [ids.event, ids.session]);
      await save([speaker]);
    });
    expect((await db.query("select review_status from public.agenda_import_notes where session_id=$1", [ids.session])).rows).toEqual([{ review_status: "pending" }]);
  });
});
