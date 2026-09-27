import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";

describe("audited private organizer program decisions", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDatabase(); await seedSecurityFixture(db);
    await db.query("update public.attendees set access_role='sponsor' where id=$1", [ids.bobAttendee]);
  });
  beforeEach(async () => {
    await db.query("delete from public.agenda_import_notes where event_id=$1", [ids.event]);
    await db.query("update public.agenda_sessions set title='Working session',published=true where id=$1", [ids.session]);
    await db.query("insert into public.agenda_import_notes(event_id,session_id,source_sheet,source_row,issue) values($1,$2,'Day 2',12,'Conflicting source times')", [ids.event, ids.session]);
  });
  afterAll(async () => { await db?.close(); });
  const record = (status: string, notes: string, version = 0, event = ids.event) =>
    db.query("select public.record_agenda_review($1,$2,$3,$4,$5)", [event, ids.session, status, notes, version]);

  it("denies anonymous, Member, Sponsor and other-event access", async () => {
    await asUser(db, null, async () => { await expect(record("confirmed", "Reviewed")).rejects.toThrow(/permission denied/); });
    for (const user of [ids.alice, ids.bob, ids.outsider]) {
      await asUser(db, user, async () => {
        expect((await db.query("select * from public.agenda_import_notes")).rows).toHaveLength(0);
        await expect(record("confirmed", "Reviewed")).rejects.toThrow(/Organizer access/);
      });
    }
    await asUser(db, ids.admin, async () => { await expect(record("confirmed", "Reviewed", 0, ids.otherEvent)).rejects.toThrow(/Organizer access/); });
  });
  it("does not allow direct updates to forge an audited review", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query("update public.agenda_import_notes set review_status='confirmed'")).rejects.toThrow(/permission denied/);
    });
  });
  it("preserves the original question and records identity, evidence and version", async () => {
    await asUser(db, ids.admin, () => record("confirmed", "Organizer confirmed corrected times"));
    const row = (await db.query<Record<string, unknown>>("select issue,review_status,resolution_notes,review_version,reviewed_by,reviewed_at from public.agenda_import_notes")).rows[0];
    expect(row).toMatchObject({ issue: "Conflicting source times", review_status: "confirmed", resolution_notes: "Organizer confirmed corrected times", review_version: 1, reviewed_by: ids.admin });
    expect(row.reviewed_at).toBeTruthy();
    expect((await db.query("select * from public.audit_log where action='agenda_review.record'")).rows.length).toBeGreaterThan(0);
  });
  it("requires meaningful evidence and a valid state", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(record("confirmed", "  ")).rejects.toThrow(/describe the organizer confirmation/);
      await expect(record("arbitrary", "Reviewed")).rejects.toThrow(/Choose a review decision/);
      await expect(record("confirmed", "x".repeat(2001))).rejects.toThrow(/Choose a review decision/);
    });
  });
  it("requires publication to agree with the recorded decision", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(record("excluded", "Removed from the program")).rejects.toThrow(/Unpublish/);
      await db.query("update public.agenda_sessions set published=false where id=$1", [ids.session]);
      await expect(record("confirmed", "Ready for attendees")).rejects.toThrow(/publish the session/);
      await record("excluded", "Organizer removed this session");
    });
    expect((await db.query<{ published: boolean }>("select published from public.agenda_sessions where id=$1", [ids.session])).rows[0].published).toBe(false);
  });
  it("rejects stale decisions and permits an explicit reopen", async () => {
    await asUser(db, ids.admin, async () => {
      await record("confirmed", "Approved at program review");
      await expect(record("pending", "Stale change", 0)).rejects.toThrow(/review changed/);
      await record("pending", "Organizer is revising the program", 1);
    });
    expect((await db.query("select review_status,review_version,reviewed_at from public.agenda_import_notes")).rows[0]).toEqual({ review_status: "pending", review_version: 2, reviewed_at: null });
  });
  it("reopens a completed decision after attendee-facing session changes", async () => {
    await asUser(db, ids.admin, async () => {
      await record("confirmed", "Original approval retained");
      await db.query("update public.agenda_sessions set title='Updated session title' where id=$1", [ids.session]);
    });
    expect((await db.query("select review_status,review_version,resolution_notes from public.agenda_import_notes")).rows[0]).toEqual({ review_status: "pending", review_version: 2, resolution_notes: "Original approval retained" });
    expect((await db.query("select * from public.audit_log where action='agenda_review.reopened'")).rows.length).toBeGreaterThan(0);
  });
  it("does not reopen a decision on a no-op save", async () => {
    await asUser(db, ids.admin, async () => {
      await record("confirmed", "Confirmed with organizer");
      await db.query("update public.agenda_sessions set title=title where id=$1", [ids.session]);
    });
    expect((await db.query("select review_status,review_version from public.agenda_import_notes")).rows[0]).toEqual({ review_status: "confirmed", review_version: 1 });
  });
});
