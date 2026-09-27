import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";

describe("hosted explicit function privileges", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDatabase({ hostedFunctionGrants: true }); await seedSecurityFixture(db); });
  afterAll(async () => { await db?.close(); });

  it("exposes only public-guide authorization helpers to anonymous users", async () => {
    const result = await db.query<{ name: string }>(`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')
      order by p.proname`);
    expect(result.rows.map((row) => row.name)).toEqual(["can_read_event", "is_event_admin"]);
  });
  it("preserves anonymous access to the public program, not private registration", async () => {
    await asUser(db, null, async () => {
      expect((await db.query("select id from public.agenda_sessions")).rows).toHaveLength(1);
      await expect(db.query("select * from public.attendees")).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.claim_attendee($1)", [ids.event])).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.open_conversation($1,$2)", [ids.event, ids.bobAttendee])).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.list_inbox($1)", [ids.event])).rejects.toThrow(/permission denied/);
    });
  });
  it("does not expose trigger functions as authenticated API endpoints", async () => {
    const result = await db.query<{ name: string }>(`
      select p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and p.prorettype='trigger'::regtype
      and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))`);
    expect(result.rows).toEqual([]);
  });
  it("retains member messaging, consent enforcement and database notifications", async () => {
    await db.query("update public.attendee_profiles set directory_visible=true,messaging_available=true where event_id=$1", [ids.event]);
    await asUser(db, ids.alice, async () => {
      const opened = await db.query<{ id: string }>("select public.open_conversation($1,$2) as id", [ids.event, ids.bobAttendee]);
      const thread = opened.rows[0].id;
      const sent = await db.query<{ id: number }>("select id from public.send_message($1,$2,gen_random_uuid(),'Private verified test')", [ids.event, thread]);
      expect(sent.rows).toHaveLength(1);
      await db.query("select public.mark_conversation_read($1,$2,$3)", [ids.event, thread, sent.rows[0].id]);
      expect((await db.query("select * from public.list_inbox($1)", [ids.event])).rows).toHaveLength(1);
    });
    expect((await db.query("select * from realtime.messages")).rows.length).toBeGreaterThan(0);
  });
});
