import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";
import { demoGuide } from "../src/lib/demo";
import { evaluateContent } from "../src/lib/launch-readiness";

describe("computed content readiness", () => {
  it("does not mistake published sample records for confirmed event content", () => {
    const report = evaluateContent(demoGuide, 6);
    expect(report.find((r) => r.key === "samples")?.status).toBe("needs_attention");
    expect(report.find((r) => r.key === "sponsors")?.status).toBe("needs_attention");
    expect(report.every((r) => r.href.startsWith("/admin"))).toBe(true);
  });
  it("finds published sessions on unpublished days and broken sponsor placements", () => {
    const guide = structuredClone(demoGuide);
    guide.days[0].published = false;
    const report = evaluateContent(guide, 6);
    expect(report.find((r) => r.key === "agenda")?.detail).toContain("unpublished days");
    expect(report.find((r) => r.key === "sponsors")?.detail).toContain("unpublished content");
  });
  it("flags missing registration and dietary data without inventing it", () => {
    const guide = structuredClone(demoGuide);
    guide.lunches[0].dietary_info = "";
    expect(evaluateContent(guide, 0).filter((r) => ["lunch", "roster"].includes(r.key)).every((r) => r.status === "needs_attention")).toBe(true);
  });
});

describe("durable organizer launch checks", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDatabase(); await seedSecurityFixture(db); });
  afterAll(async () => { await db?.close(); });
  it("denies anonymous and attendee access, including direct API database calls", async () => {
    await asUser(db, null, async () => { await expect(db.query("select * from public.launch_checks")).rejects.toThrow(/permission denied/); });
    await asUser(db, ids.alice, async () => {
      expect((await db.query("select * from public.launch_checks")).rows).toHaveLength(0);
      await expect(db.query("select public.record_launch_check($1,'email_delivery',true,'Tested',0)", [ids.event])).rejects.toThrow(/Organizer/);
    });
  });
  it("records the authenticated organizer, notes and verification time", async () => {
    await asUser(db, ids.admin, async () => {
      await db.query("select public.record_launch_check($1,'email_delivery',true,'Verified in two staging inboxes',0)", [ids.event]);
      const row = (await db.query<{ verified: boolean; verified_by: string; version: number; verified_at: string }>("select * from public.launch_checks")).rows[0];
      expect(row.verified).toBe(true); expect(row.verified_by).toBe(ids.admin); expect(row.version).toBe(1); expect(row.verified_at).toBeTruthy();
      expect((await db.query("select * from public.audit_log where action='launch_check.record'")).rows).toHaveLength(1);
    });
  });
  it("requires evidence notes and prevents forging a record directly", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query("select public.record_launch_check($1,'mobile_offline',true,'',0)", [ids.event])).rejects.toThrow(/include a note/);
      await expect(db.query("insert into public.launch_checks(event_id,check_key,verified) values ($1,'mobile_offline',false)", [ids.event])).rejects.toThrow(/permission denied/);
      await expect(db.query("select public.record_launch_check($1,'email_delivery',true,'Wrong event',0)", [ids.otherEvent])).rejects.toThrow(/Organizer/);
    });
  });
  it("rejects stale writes and allows an explicit re-open without losing its notes", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query("select public.record_launch_check($1,'email_delivery',false,'Stale update',0)", [ids.event])).rejects.toThrow(/Another organizer/);
      await db.query("select public.record_launch_check($1,'email_delivery',false,'Sender changed; repeat the delivery test',1)", [ids.event]);
      const row = (await db.query<{ verified: boolean; version: number; verified_at: string | null }>("select * from public.launch_checks")).rows[0];
      expect(row.verified).toBe(false); expect(row.version).toBe(2); expect(row.verified_at).toBeNull();
    });
  });
});
