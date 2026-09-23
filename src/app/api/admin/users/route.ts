import { eventUserSchema, type EventUser } from "@/lib/roles";
import { demoGuide, demoProfiles } from "@/lib/demo";
import { requireAdmin } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/guide";
import { databaseError, handle, json, parseBody } from "@/lib/server/http";

export const GET = (request: Request) => handle(async () => {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 100).replace(/[^\p{L}\p{N} @.\-]/gu, "").trim();
  const offset = Math.max(0, Math.min(Number(params.get("offset")) || 0, 10000));
  if (isDemo()) {
    const rows: EventUser[] = demoProfiles.map((p, i) => ({ id: p.attendee_id, registration_name: p.full_name,
      registration_email: `attendee${i + 1}@example.test`, user_id: null, role: i === 0 ? "admin" : i === 1 ? "sponsor" : "member",
      status: "approved", directory_allowed: true, access_version: 0, sponsor_ids: i === 1 ? [demoGuide.sponsors[1].id] : [] }));
    const matching = rows.filter((r) => `${r.registration_name} ${r.registration_email}`.toLowerCase().includes(q.toLowerCase()));
    return json({ rows: matching, hasMore: false, sponsors: demoGuide.sponsors.map((s) => ({ id: s.id, name: s.name })) });
  }
  const { db, event } = await requireAdmin();
  let query = db.from("attendees").select("id,registration_name,registration_email,user_id,status,directory_allowed,access_role,access_version")
    .eq("event_id", event.id).order("registration_name").order("id").range(offset, offset + 50);
  if (q) query = query.or(`registration_name.ilike.%${q}%,registration_email.ilike.%${q}%`);
  const [users, assignments, sponsors, legacyAdmins] = await Promise.all([
    query,
    db.from("sponsor_editors").select("attendee_id,sponsor_id").eq("event_id", event.id),
    db.from("sponsors").select("id,name").eq("event_id", event.id).order("name"),
    db.from("event_admins").select("user_id").eq("event_id", event.id),
  ]);
  [users, assignments, sponsors, legacyAdmins].forEach((r) => databaseError(r.error));
  const adminIds = new Set((legacyAdmins.data ?? []).map((a) => a.user_id));
  const rows = (users.data ?? []).slice(0, 50).map((u) => ({ ...u, role: adminIds.has(u.user_id) ? "admin" : u.access_role,
    sponsor_ids: (assignments.data ?? []).filter((a) => a.attendee_id === u.id).map((a) => a.sponsor_id) }));
  return json({ rows, hasMore: (users.data?.length ?? 0) > 50, sponsors: sponsors.data ?? [] });
});

export const POST = (request: Request) => handle(async () => {
  const body = await parseBody(request, eventUserSchema);
  const { db, event } = await requireAdmin();
  const result = await db.rpc("admin_save_event_user", { p_event: event.id, p_id: body.id,
    p_name: body.registration_name, p_email: body.registration_email, p_role: body.role, p_status: body.status,
    p_directory_allowed: body.directory_allowed, p_sponsors: body.sponsor_ids, p_expected_version: body.expected_version });
  databaseError(result.error);
  return json({ saved: true, id: result.data });
});
