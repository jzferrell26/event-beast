import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";

let db: PGlite;
let conversation: string;
let messageId: number;

beforeAll(async () => { db = await createDatabase(); await seedSecurityFixture(db); });
afterAll(async () => { await db?.close(); });

describe("registration and directory boundaries", () => {
  it("publishes event essentials but never registration data to anonymous users", async () => {
    await asUser(db, null, async () => {
      expect((await db.query("select id from public.agenda_sessions")).rows).toHaveLength(1);
      await expect(db.query("select * from public.attendees")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.attendee_profiles")).rejects.toThrow(/permission denied/);
    });
  });
  it("does not grant event access just because an auth account exists", async () => {
    await asUser(db, ids.outsider, async () => {
      expect((await db.query<{ claim_attendee: string | null }>("select public.claim_attendee($1)", [ids.event])).rows[0].claim_attendee).toBeNull();
      expect((await db.query("select * from public.attendee_profiles")).rows).toHaveLength(0);
    });
  });
  it("requires verified email ownership to claim an imported registration", async () => {
    await asUser(db, ids.unverified, async () => {
      await expect(db.query("select public.claim_attendee($1)", [ids.event])).rejects.toThrow(/Verify your email/);
    });
  });
  it("creates profiles with directory and messaging opt-out and no copied contact email", async () => {
    const result = await db.query<{ directory_visible: boolean; messaging_available: boolean; public_email: string }>("select directory_visible,messaging_available,public_email from public.attendee_profiles");
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) expect(row).toEqual({ directory_visible: false, messaging_available: false, public_email: "" });
    await asUser(db, ids.alice, async () => expect((await db.query("select * from public.attendee_profiles")).rows).toHaveLength(1));
  });
  it("prevents attendee role escalation and cross-profile changes", async () => {
    await asUser(db, ids.alice, async () => {
      expect((await db.query("update public.attendees set status='approved' where id=$1 returning id", [ids.bobAttendee])).rows).toHaveLength(0);
      expect((await db.query("update public.attendee_profiles set bio='hijack' where attendee_id=$1 returning attendee_id", [ids.bobAttendee])).rows).toHaveLength(0);
      await expect(db.query("insert into public.event_admins(event_id,user_id) values ($1,$2)", [ids.event, ids.alice])).rejects.toThrow(/permission denied/);
      await expect(db.query("update public.attendee_profiles set event_id=$1 where attendee_id=$2", [ids.otherEvent, ids.aliceAttendee])).rejects.toThrow(/permission denied/);
    });
  });
  it("exposes only opted-in profiles to other eligible attendees", async () => {
    await asUser(db, ids.bob, () => db.query("update public.attendee_profiles set directory_visible=true,messaging_available=true where attendee_id=$1", [ids.bobAttendee]));
    await asUser(db, ids.alice, async () => {
      expect((await db.query("select * from public.attendee_profiles")).rows).toHaveLength(2);
      expect((await db.query("select registration_email from public.attendees")).rows).toHaveLength(1);
      await db.query("update public.attendee_profiles set directory_visible=true,messaging_available=true where attendee_id=$1", [ids.aliceAttendee]);
    });
  });
});

describe("durable private messaging", () => {
  it("creates exactly one canonical conversation for both participant orders", async () => {
    conversation = (await asUser(db, ids.alice, () => db.query<{ open_conversation: string }>("select public.open_conversation($1,$2)", [ids.event, ids.bobAttendee]))).rows[0].open_conversation;
    const reverse = await asUser(db, ids.bob, () => db.query<{ open_conversation: string }>("select public.open_conversation($1,$2)", [ids.event, ids.aliceAttendee]));
    expect(reverse.rows[0].open_conversation).toBe(conversation);
    expect((await db.query("select * from public.conversations")).rows).toHaveLength(1);
  });
  it("persists a message exactly once across a retried send and rejects key reuse with changed text", async () => {
    await asUser(db, ids.alice, async () => {
      const args = [ids.event, conversation, "70000000-0000-4000-8000-000000000001", "Meet at the welcome desk?"];
      const first = await db.query<{ id: number }>("select (public.send_message($1,$2,$3,$4)).*", args);
      const retry = await db.query<{ id: number }>("select (public.send_message($1,$2,$3,$4)).*", args);
      messageId = Number(first.rows[0].id);
      expect(retry.rows[0].id).toBe(first.rows[0].id);
      expect((await db.query("select * from public.messages")).rows).toHaveLength(1);
      await expect(db.query("select public.send_message($1,$2,$3,$4)", [...args.slice(0, 3), "Changed message"])).rejects.toThrow(/Idempotency key/);
    });
  });
  it("allows the recipient to read durable history but prevents outsiders and direct spoofed writes", async () => {
    await asUser(db, ids.bob, async () => expect((await db.query("select * from public.messages")).rows).toHaveLength(1));
    await asUser(db, ids.outsider, async () => {
      expect((await db.query("select * from public.conversations")).rows).toHaveLength(0);
      expect((await db.query("select * from public.messages")).rows).toHaveLength(0);
      await expect(db.query("select public.send_message($1,$2,gen_random_uuid(),'intrusion')", [ids.event, conversation])).rejects.toThrow(/Event access required/);
    });
    await asUser(db, ids.alice, async () => {
      await expect(db.query("insert into public.messages(event_id,conversation_id,sender_id,client_id,body) values ($1,$2,$3,gen_random_uuid(),'spoof')", [ids.event, conversation, ids.bobAttendee])).rejects.toThrow(/permission denied/);
    });
  });
  it("keeps read cursors monotonic and scoped to the current conversation", async () => {
    await asUser(db, ids.bob, async () => {
      await db.query("select public.mark_conversation_read($1,$2,$3)", [ids.event, conversation, messageId]);
      await db.query("select public.mark_conversation_read($1,$2,0)", [ids.event, conversation]);
      const read = await db.query<{ last_read_id: number }>("select last_read_id from public.conversation_reads where attendee_id=$1", [ids.bobAttendee]);
      expect(Number(read.rows[0].last_read_id)).toBe(messageId);
    });
  });
  it("uses private per-attendee channels and sends no message text through Realtime", async () => {
    const realtime = await db.query<{ payload: Record<string, unknown>; private: boolean }>("select payload,private from realtime.messages");
    expect(realtime.rows.length).toBeGreaterThan(0);
    for (const row of realtime.rows) { expect(row.private).toBe(true); expect(row.payload).not.toHaveProperty("body"); }
    await asUser(db, ids.alice, async () => {
      const own = `event:${ids.event}:attendee:${ids.aliceAttendee}`;
      const peer = `event:${ids.event}:attendee:${ids.bobAttendee}`;
      expect((await db.query<{ allowed: boolean }>("select public.can_receive_event_realtime($1) as allowed", [own])).rows[0].allowed).toBe(true);
      expect((await db.query<{ allowed: boolean }>("select public.can_receive_event_realtime($1) as allowed", [peer])).rows[0].allowed).toBe(false);
    });
  });
  it("blocks sends in both directions while preserving authorized history", async () => {
    await asUser(db, ids.bob, () => db.query("select public.set_attendee_block($1,$2,true)", [ids.event, ids.aliceAttendee]));
    for (const user of [ids.alice, ids.bob]) {
      await asUser(db, user, async () => {
        await expect(db.query("select public.send_message($1,$2,gen_random_uuid(),'blocked')", [ids.event, conversation])).rejects.toThrow(/unavailable/);
        expect((await db.query("select * from public.messages")).rows).toHaveLength(1);
        expect((await db.query("select * from public.attendee_profiles")).rows).toHaveLength(1);
      });
    }
    await asUser(db, ids.bob, () => db.query("select public.set_attendee_block($1,$2,false)", [ids.event, ids.aliceAttendee]));
  });
  it("allows reporting a received message without granting organizers blanket inbox access", async () => {
    await asUser(db, ids.bob, () => db.query("select public.report_attendee($1,$2,'Please review this message',$3)", [ids.event, ids.aliceAttendee, messageId]));
    await asUser(db, ids.admin, async () => {
      expect((await db.query("select * from public.reports")).rows).toHaveLength(1);
      expect((await db.query("select * from public.messages")).rows).toHaveLength(0);
    });
  });
  it("revokes private data, sends and channel authorization when access is disabled", async () => {
    await db.query("update public.attendees set status='disabled' where id=$1", [ids.bobAttendee]);
    await asUser(db, ids.bob, async () => {
      expect((await db.query("select * from public.messages")).rows).toHaveLength(0);
      expect((await db.query("select * from public.attendee_profiles")).rows).toHaveLength(0);
      const result = await db.query<{ allowed: boolean }>("select public.can_receive_event_realtime($1) as allowed", [`event:${ids.event}:attendee:${ids.bobAttendee}`]);
      expect(result.rows[0].allowed).toBe(false);
    });
    await asUser(db, ids.alice, async () => await expect(db.query("select public.send_message($1,$2,gen_random_uuid(),'disabled')", [ids.event, conversation])).rejects.toThrow(/unavailable/));
    await db.query("update public.attendees set status='approved' where id=$1", [ids.bobAttendee]);
  });
});

describe("organizer controls and event isolation", () => {
  it("rejects agenda writes by attendees and allows organizer CRUD", async () => {
    await asUser(db, ids.alice, async () => expect((await db.query("update public.agenda_sessions set title='unauthorized' where id=$1 returning id", [ids.session])).rows).toHaveLength(0));
    await asUser(db, ids.admin, async () => {
      const created = await db.query<{ id: string }>("insert into public.agenda_sessions(event_id,day_id,title,starts_at,ends_at) values ($1,$2,'Draft','2026-10-08T16:00:00Z','2026-10-08T17:00:00Z') returning id", [ids.event, ids.day]);
      await db.query("update public.agenda_sessions set title='Updated' where id=$1", [created.rows[0].id]);
      await db.query("delete from public.agenda_sessions where id=$1", [created.rows[0].id]);
    });
  });
  it("enforces sponsor placement day and cross-event references in the database", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query("insert into public.agenda_sponsor_placements(event_id,day_id,after_session_id,sponsor_id) values ($1,$2,$3,$4)", [ids.event, ids.otherDay, ids.session, ids.sponsor])).rejects.toThrow(/same day/);
      await db.query("insert into public.agenda_sponsor_placements(event_id,day_id,after_session_id,sponsor_id,published) values ($1,$2,$3,$4,true)", [ids.event, ids.day, ids.session, ids.sponsor]);
      await expect(db.query("insert into public.conversations(event_id,attendee_a,attendee_b) values ($1,$2,$3)", [ids.event, ids.aliceAttendee, ids.foreignAttendee])).rejects.toThrow(/permission denied/);
    });
    await expect(db.query("insert into public.conversations(event_id,attendee_a,attendee_b) values ($1,$2,$3)", [ids.event, ids.aliceAttendee, ids.foreignAttendee])).rejects.toThrow(/foreign key/);
  });
  it("validates imports atomically, preserves disabled access and never publishes profiles", async () => {
    await asUser(db, ids.alice, async () => await expect(db.query("select public.import_attendees($1,$2)", [ids.event, JSON.stringify([{ email: "new@example.test", name: "New" }])])).rejects.toThrow(/Organizer/));
    await asUser(db, ids.admin, async () => {
      await expect(db.query("select public.import_attendees($1,$2)", [ids.event, JSON.stringify([{ email: "new@example.test", name: "New" }, { email: "NEW@example.test", name: "Duplicate" }])])).rejects.toThrow(/duplicate/);
      expect((await db.query("select id from public.attendees where registration_email='new@example.test'")).rows).toHaveLength(0);
      await db.query("update public.attendees set status='disabled' where id=$1", [ids.bobAttendee]);
      await db.query("select public.import_attendees($1,$2)", [ids.event, JSON.stringify([{ email: "new@example.test", name: "New" }, { email: "bob@example.test", name: "Bob Sample" }])]);
      expect((await db.query<{ status: string }>("select status from public.attendees where id=$1", [ids.bobAttendee])).rows[0].status).toBe("disabled");
      expect((await db.query("select * from public.attendee_profiles")).rows).toHaveLength(2);
    });
  });
  it("keeps private headshots scoped to their owner or an authorized profile viewer", async () => {
    await asUser(db, ids.alice, async () => {
      await db.query("insert into storage.objects(bucket_id,name) values ('event-headshots',$1)", [`${ids.event}/${ids.aliceAttendee}/photo.jpg`]);
      await expect(db.query("insert into storage.objects(bucket_id,name) values ('event-headshots',$1)", [`${ids.event}/${ids.bobAttendee}/photo.jpg`])).rejects.toThrow(/row-level security/);
    });
    await asUser(db, ids.outsider, async () => expect((await db.query("select * from storage.objects")).rows).toHaveLength(0));
  });
});
