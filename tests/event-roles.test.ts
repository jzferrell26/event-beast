import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "./db-harness";
import { eventUserSchema, sponsorPageSchema } from "../src/lib/roles";

let db: PGlite;
const otherSponsor = "60000000-0000-4000-8000-000000000002";
const foreignSponsor = "60000000-0000-4000-8000-000000000003";
const fields = { name: "Sponsor updated by its team", description: "New public introduction", logo_url: "", booth: "Booth 4", cta_label: "Meet our team", cta_url: "https://example.com" };
const saveUserSql = "select public.admin_save_event_user($1,$2,$3,$4,$5,$6,$7,$8,$9) as id";
const savePageSql = "select p.* from public.save_sponsor_page($1,$2,$3,$4) p";

beforeAll(async () => {
  db = await createDatabase(); await seedSecurityFixture(db);
  await db.query("update public.sponsors set published=false where id=$1", [ids.sponsor]);
  await db.query("insert into public.sponsors(id,event_id,name,published) values ($1,$2,'Other sponsor draft',false),($3,$4,'Foreign event sponsor',false)", [otherSponsor, ids.event, foreignSponsor, ids.otherEvent]);
});
afterAll(async () => { await db?.close(); });

async function assign(target: string, role: string, sponsors: string[] = [], status = "approved") {
  const row = (await db.query<{ registration_name: string; registration_email: string; access_version: number }>("select registration_name,registration_email,access_version from public.attendees where id=$1", [target])).rows[0];
  return asUser(db, ids.admin, () => db.query(saveUserSql, [ids.event, target, row.registration_name, row.registration_email, role, status, true, sponsors, row.access_version]));
}

describe("event roles and sponsor isolation", () => {
  it("starts registrations as Members and refuses self-promotion or direct assignment writes", async () => {
    await asUser(db, ids.alice, async () => {
      expect((await db.query<{ access_role: string }>("select access_role from public.attendees where id=$1", [ids.aliceAttendee])).rows[0].access_role).toBe("member");
      await expect(db.query("update public.attendees set access_role='admin' where id=$1", [ids.aliceAttendee])).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into public.sponsor_editors values ($1,$2,$3,now())", [ids.event, ids.sponsor, ids.aliceAttendee])).rejects.toThrow(/permission denied/);
      await expect(db.query(saveUserSql, [ids.event, null, "Unapproved admin", "hacker@example.test", "admin", "approved", true, [], null])).rejects.toThrow(/Admin access required/);
    });
  });

  it("lets Admin assign sponsor pages without publishing a private attendee profile", async () => {
    await assign(ids.aliceAttendee, "sponsor", [ids.sponsor]);
    const row = (await db.query<{ directory_visible: boolean }>("select directory_visible from public.attendee_profiles where attendee_id=$1", [ids.aliceAttendee])).rows[0];
    expect(row.directory_visible).toBe(false);
    await asUser(db, ids.alice, async () => {
      expect((await db.query("select id from public.sponsors where published=false")).rows).toEqual([{ id: ids.sponsor }]);
      expect((await db.query<{ allowed: boolean }>("select public.is_event_admin($1) as allowed", [ids.event])).rows[0].allowed).toBe(false);
      expect((await db.query("select * from public.sponsor_editors")).rows).toHaveLength(1);
    });
  });

  it("persists own sponsor content and increments version while contractual fields stay unchanged", async () => {
    const before = (await db.query<{ content_version: number; tier_id: string | null; published: boolean; sort_order: number }>("select * from public.sponsors where id=$1", [ids.sponsor])).rows[0];
    const saved = await asUser(db, ids.alice, () => db.query<{ name: string; content_version: number; published: boolean; sort_order: number }>(savePageSql, [ids.event, ids.sponsor, before.content_version, fields]));
    expect(saved.rows[0].name).toBe(fields.name);
    expect(saved.rows[0].content_version).toBe(before.content_version + 1);
    expect(saved.rows[0].published).toBe(before.published);
    expect(saved.rows[0].sort_order).toBe(before.sort_order);
    await asUser(db, ids.alice, async () => await expect(db.query(savePageSql, [ids.event, ids.sponsor, before.content_version, fields])).rejects.toThrow(/has changed/));
  });

  it("rejects edits to other sponsors and another event even with a known UUID", async () => {
    await asUser(db, ids.alice, async () => {
      for (const [event, sponsor] of [[ids.event, otherSponsor], [ids.otherEvent, foreignSponsor]]) {
        await expect(db.query(savePageSql, [event, sponsor, 0, fields])).rejects.toThrow(/access to edit/);
      }
      expect((await db.query("update public.sponsors set name='Unauthorized' where id=$1 returning id", [otherSponsor])).rows).toHaveLength(0);
    });
  });

  it("does not let sponsors promote their tier, publish themselves, delete pages or edit event settings", async () => {
    await asUser(db, ids.alice, async () => {
      await expect(db.query(savePageSql, [ids.event, ids.sponsor, 2, { ...fields, featured: true }])).rejects.toThrow(/Only sponsor page content/);
      expect((await db.query("update public.sponsors set published=true,featured=true where id=$1 returning id", [ids.sponsor])).rows).toHaveLength(0);
      expect((await db.query("delete from public.sponsors where id=$1 returning id", [ids.sponsor])).rows).toHaveLength(0);
      expect((await db.query("update public.event_settings set messaging_enabled=false where event_id=$1 returning event_id", [ids.event])).rows).toHaveLength(0);
    });
  });

  it("Members can view public event content but cannot edit sponsor pages or inspect assignments", async () => {
    await asUser(db, ids.bob, async () => {
      expect((await db.query("select * from public.agenda_sessions")).rows).toHaveLength(1);
      expect((await db.query("select * from public.sponsor_editors")).rows).toHaveLength(0);
      await expect(db.query(savePageSql, [ids.event, ids.sponsor, 2, fields])).rejects.toThrow(/access to edit/);
    });
  });

  it("restricts sponsor uploads and removal to their assigned sponsor folder", async () => {
    await asUser(db, ids.alice, async () => {
      const own = `${ids.event}/sponsors/${ids.sponsor}/logo.webp`;
      await db.query("insert into storage.objects(bucket_id,name) values ('event-assets',$1)", [own]);
      await expect(db.query("insert into storage.objects(bucket_id,name) values ('event-assets',$1)", [`${ids.event}/sponsors/${otherSponsor}/logo.webp`])).rejects.toThrow(/row-level security/);
      await expect(db.query("insert into storage.objects(bucket_id,name) values ('event-assets',$1)", [`${ids.event}/organizer/map.webp`])).rejects.toThrow(/row-level security/);
      expect((await db.query("delete from storage.objects where name=$1 returning name", [own])).rows).toHaveLength(1);
    });
  });

  it("revokes sponsor access on disable, reassignment and role downgrade", async () => {
    await assign(ids.aliceAttendee, "sponsor", [ids.sponsor], "disabled");
    await asUser(db, ids.alice, async () => await expect(db.query(savePageSql, [ids.event, ids.sponsor, 2, fields])).rejects.toThrow(/access to edit/));
    await assign(ids.aliceAttendee, "sponsor", [otherSponsor]);
    await asUser(db, ids.alice, async () => {
      expect((await db.query<{ yes: boolean }>("select public.can_edit_sponsor($1,$2) as yes", [ids.event, ids.sponsor])).rows[0].yes).toBe(false);
      expect((await db.query<{ yes: boolean }>("select public.can_edit_sponsor($1,$2) as yes", [ids.event, otherSponsor])).rows[0].yes).toBe(true);
    });
    await assign(ids.aliceAttendee, "member");
    expect((await db.query("select * from public.sponsor_editors where attendee_id=$1", [ids.aliceAttendee])).rows).toHaveLength(0);
  });

  it("grants full administration to an assigned Admin including any sponsor and user roles", async () => {
    await assign(ids.bobAttendee, "admin");
    await asUser(db, ids.bob, async () => {
      expect((await db.query<{ yes: boolean }>("select public.is_event_admin($1) as yes", [ids.event])).rows[0].yes).toBe(true);
      expect((await db.query("update public.sponsors set sort_order=42,published=true where id=$1 returning id", [otherSponsor])).rows).toHaveLength(1);
      expect((await db.query("update public.event_settings set welcome_title='Admin edited welcome' where event_id=$1 returning event_id", [ids.event])).rows).toHaveLength(1);
      const newUser = await db.query(saveUserSql, [ids.event, null, "Pending sponsor contact", "future@example.test", "sponsor", "approved", false, [ids.sponsor], null]);
      expect(newUser.rows).toHaveLength(1);
    });
  });

  it("rejects stale role edits and cross-event sponsor assignments atomically", async () => {
    await asUser(db, ids.admin, async () => {
      await expect(db.query(saveUserSql, [ids.event, ids.aliceAttendee, "Alice Sample", "alice@example.test", "admin", "approved", true, [], -1])).rejects.toThrow(/another admin/);
      await expect(db.query(saveUserSql, [ids.event, null, "Foreign", "foreign@example.test", "sponsor", "approved", true, [foreignSponsor], null])).rejects.toThrow(/does not belong/);
    });
    expect((await db.query("select id from public.attendees where registration_email='foreign@example.test'")).rows).toHaveLength(0);
  });

  it("keeps at least one active admin and audits successful permission assignments", async () => {
    // The original bootstrap admin is unlinked; remove it as database owner so
    // Bob is the final verified application administrator for this scenario.
    await db.query("delete from public.event_admins where user_id=$1", [ids.admin]);
    const version = (await db.query<{ access_version: number }>("select access_version from public.attendees where id=$1", [ids.bobAttendee])).rows[0].access_version;
    await asUser(db, ids.bob, async () => {
      await expect(db.query(saveUserSql, [ids.event, ids.bobAttendee, "Bob Sample", "bob@example.test", "member", "approved", true, [], version])).rejects.toThrow(/at least one active/);
      await expect(db.query("update public.attendees set status='disabled' where id=$1", [ids.bobAttendee])).rejects.toThrow(/at least one active/);
      await expect(db.query("delete from public.attendees where id=$1", [ids.bobAttendee])).rejects.toThrow(/permission denied/);
      expect((await db.query("select id from public.audit_log where action='event_user.permissions'")).rows.length).toBeGreaterThan(4);
    });
  });
});

describe("pre-event role activation", () => {
  let isolated: PGlite;
  beforeAll(async () => { isolated = await createDatabase(); await seedSecurityFixture(isolated); });
  afterAll(async () => { await isolated?.close(); });
  it("lets an eligible verified sponsor claim access before publication while outsiders learn nothing", async () => {
    await isolated.query("update public.events set published=false where id=$1", [ids.event]);
    await isolated.query("update public.attendees set user_id=null,access_role='sponsor' where id=$1", [ids.aliceAttendee]);
    await isolated.query("insert into public.sponsor_editors(event_id,sponsor_id,attendee_id) values ($1,$2,$3)", [ids.event, ids.sponsor, ids.aliceAttendee]);
    await asUser(isolated, ids.outsider, async () => {
      expect((await isolated.query<{ id: string | null }>("select public.claim_event_access('security-test') as id")).rows[0].id).toBeNull();
      expect((await isolated.query("select id from public.events")).rows).toHaveLength(0);
    });
    await asUser(isolated, ids.alice, async () => {
      expect((await isolated.query<{ id: string | null }>("select public.claim_event_access('security-test') as id")).rows[0].id).toBe(ids.event);
      expect((await isolated.query<{ yes: boolean }>("select public.can_edit_sponsor($1,$2) as yes", [ids.event, ids.sponsor])).rows[0].yes).toBe(true);
    });
  });
  it("does not turn an unverified account into event access", async () => {
    await asUser(isolated, ids.unverified, async () => {
      expect((await isolated.query<{ id: string | null }>("select public.claim_event_access('security-test') as id")).rows[0].id).toBeNull();
    });
  });
  it("gives the verified bootstrap admin a private attendee profile without granting anyone else admin privileges", async () => {
    await asUser(isolated, ids.admin, async () => {
      const claim = (await isolated.query<{ id: string }>("select public.claim_admin_attendee($1) as id", [ids.event])).rows[0].id;
      expect(claim).toBeTruthy();
      const again = (await isolated.query<{ id: string }>("select public.claim_admin_attendee($1) as id", [ids.event])).rows[0].id;
      expect(again).toBe(claim);
      expect((await isolated.query<{ directory_visible: boolean }>("select directory_visible from public.attendee_profiles where attendee_id=$1", [claim])).rows[0].directory_visible).toBe(false);
    });
    await asUser(isolated, ids.bob, async () => await expect(isolated.query("select public.claim_admin_attendee($1)", [ids.event])).rejects.toThrow(/Admin access required/));
  });
});

describe("role payload validation", () => {
  it("refuses sponsor requests containing administrative fields", () => {
    expect(sponsorPageSchema.safeParse(fields).success).toBe(true);
    for (const field of ["published", "tier_id", "event_id", "featured", "sort_order", "access_role"]) {
      expect(sponsorPageSchema.safeParse({ ...fields, [field]: "forged" }).success).toBe(false);
    }
  });
  it("requires a Sponsor assignment and prevents Member assignment pollution", () => {
    const user = { id: null, expected_version: null, registration_name: "New", registration_email: "new@example.test", role: "sponsor", status: "approved", directory_allowed: true, sponsor_ids: [] };
    expect(eventUserSchema.safeParse(user).success).toBe(false);
    expect(eventUserSchema.safeParse({ ...user, sponsor_ids: [ids.sponsor] }).success).toBe(true);
    expect(eventUserSchema.safeParse({ ...user, role: "member", sponsor_ids: [ids.sponsor] }).success).toBe(false);
  });
});
