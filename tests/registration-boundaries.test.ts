import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";

describe("registration ownership and direct API privileges", () => {
  let db: PGlite;
  let conversation: string;
  beforeAll(async () => {
    db = await createDatabase(); await seedSecurityFixture(db);
    await db.query("update public.attendee_profiles set directory_visible=true,messaging_available=true where event_id=$1", [ids.event]);
    conversation = (await asUser(db, ids.alice, () => db.query<{ id: string }>("select public.open_conversation($1,$2) as id", [ids.event, ids.bobAttendee]))).rows[0].id;
  });
  afterAll(async () => { await db?.close(); });
  it("prevents an organizer from reassigning a conversation member to their own auth account", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query("update public.attendees set user_id=$1 where id=$2", [ids.admin, ids.aliceAttendee])).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into public.attendees(event_id,registration_email,registration_name,user_id) values ($1,'new@example.test','New',$2)", [ids.event, ids.admin])).rejects.toThrow(/permission denied/);
      expect((await db.query("select * from public.conversations")).rows).toHaveLength(0);
    });
  });
  it("keeps unclaimed email correction available but rejects reassignment after claim", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query("update public.attendees set registration_email='admin@example.test' where id=$1", [ids.aliceAttendee])).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.update_attendee_access($1,$2,'Alice','admin@example.test','approved',true)", [ids.event, ids.aliceAttendee])).rejects.toThrow(/cannot be reassigned/);
      await db.query("select public.update_attendee_access($1,$2,'Corrected','corrected@example.test','approved',true)", [ids.event, ids.thirdAttendee]);
      const row = (await db.query<{ registration_email: string; user_id: string | null }>("select registration_email,user_id from public.attendees where id=$1", [ids.thirdAttendee])).rows[0];
      expect(row.registration_email).toBe("corrected@example.test"); expect(row.user_id).toBeNull();
    });
  });
  it("preserves approved roster import and attendee access management", async () => {
    await asUser(db, ids.admin, async () => {
      await db.query("select public.import_attendees($1,$2)", [ids.event, JSON.stringify([{ email: "imported@example.test", name: "Imported registration" }])]);
      const updated = await db.query("update public.attendees set status='pending',directory_allowed=false where registration_email='imported@example.test' returning id");
      expect(updated.rows).toHaveLength(1);
    });
  });
  it("rejects a send while the organizer has paused event messaging", async () => {
    await asUser(db, ids.admin, () => db.query("update public.event_settings set messaging_enabled=false where event_id=$1", [ids.event]));
    await asUser(db, ids.alice, async () => { await expect(db.query("select public.send_message($1,$2,gen_random_uuid(),'Paused')", [ids.event, conversation])).rejects.toThrow(/unavailable/); });
    await asUser(db, ids.admin, () => db.query("update public.event_settings set messaging_enabled=true where event_id=$1", [ids.event]));
  });
  it("does not broadcast redundant read-receipt writes", async () => {
    const messageId = (await asUser(db, ids.alice, () => db.query<{ id: number }>("select m.id from public.send_message($1,$2,gen_random_uuid(),'Read me') m", [ids.event, conversation]))).rows[0].id;
    await asUser(db, ids.bob, () => db.query("select public.mark_conversation_read($1,$2,$3)", [ids.event, conversation, messageId]));
    const before = (await db.query("select * from realtime.messages")).rows.length;
    await asUser(db, ids.bob, () => db.query("select public.mark_conversation_read($1,$2,$3)", [ids.event, conversation, messageId]));
    expect((await db.query("select * from realtime.messages")).rows.length).toBe(before);
  });
});
