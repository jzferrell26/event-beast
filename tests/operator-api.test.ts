import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), isDemo: vi.fn(), invalidatePublicGuide: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/server/guide", () => ({ isDemo: mocks.isDemo, invalidatePublicGuide: mocks.invalidatePublicGuide }));

import { GET, PATCH, POST } from "../src/app/api/admin/content/[resource]/route";
import { ApiError } from "../src/lib/server/http";
import { adminDefaults, adminResources } from "../src/lib/admin-resources";

const eventId = "10000000-0000-4000-8000-000000000001";
const rowId = "20000000-0000-4000-8000-000000000001";
const speakerId = "30000000-0000-4000-8000-000000000001";
const imageUrl = "https://assets.example/new.webp";
const origin = "http://localhost:3100";
const context = (resource: string) => ({ params: Promise.resolve({ resource }) });
const request = (resource: string, method: string, body: unknown, source = origin) => new Request(`${origin}/api/admin/content/${resource}`, {
  method, headers: { Origin: source, "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function query(result: { data: unknown; error: null | { code: string; message: string } }) {
  const chain = {
    update: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result), then: Promise.resolve(result).then.bind(Promise.resolve(result)),
  };
  for (const method of [chain.update, chain.select, chain.eq, chain.order, chain.range, chain.in]) method.mockReturnValue(chain);
  return chain;
}

describe("operator HTTP boundaries and guide invalidation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isDemo.mockReturnValue(false); });

  it("patches only the requested image field in the actor's event", async () => {
    for (const [resource, field] of [["speakers", "headshot_url"], ["sponsors", "logo_url"]]) {
      const chain = query({ data: { id: rowId }, error: null });
      const db = { from: vi.fn().mockReturnValue(chain) };
      mocks.requireAdmin.mockResolvedValue({ db, event: { id: eventId } });
      const response = await PATCH(request(resource, "PATCH", { id: rowId, url: imageUrl }), context(resource));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(db.from).toHaveBeenCalledWith(resource);
      expect(chain.update).toHaveBeenCalledWith({ [field]: imageUrl });
      expect(chain.eq).toHaveBeenCalledWith("event_id", eventId);
      expect(chain.eq).toHaveBeenCalledWith("id", rowId);
    }
    expect(mocks.invalidatePublicGuide).toHaveBeenCalledTimes(2);
  });

  it("rejects forged image fields, unsupported resources and cross-origin requests before writing", async () => {
    for (const body of [{ id: rowId, url: imageUrl, published: true }, { id: rowId, url: imageUrl, event_id: eventId }, { id: rowId, url: "javascript:alert(1)" }]) {
      expect((await PATCH(request("speakers", "PATCH", body), context("speakers"))).status).toBe(400);
    }
    expect((await PATCH(request("agenda_sessions", "PATCH", { id: rowId, url: imageUrl }), context("agenda_sessions"))).status).toBe(400);
    expect((await PATCH(request("speakers", "PATCH", { id: rowId, url: imageUrl }, "https://unrelated.example"), context("speakers"))).status).toBe(403);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.invalidatePublicGuide).not.toHaveBeenCalled();
  });

  it("does not announce a save or invalidate the guide when a row disappeared or RLS denies it", async () => {
    for (const [error, status] of [[null, 404], [{ code: "42501", message: "Organizer access is required" }, 403]] as const) {
      const chain = query({ data: null, error });
      mocks.requireAdmin.mockResolvedValue({ db: { from: vi.fn().mockReturnValue(chain) }, event: { id: eventId } });
      const response = await PATCH(request("speakers", "PATCH", { id: rowId, url: imageUrl }), context("speakers"));
      expect(response.status).toBe(status);
      expect(await response.json()).not.toHaveProperty("saved");
    }
    expect(mocks.invalidatePublicGuide).not.toHaveBeenCalled();
  });

  const sessionValues = { ...adminDefaults(adminResources.agenda_sessions), day_id: eventId, title: "Operator session", starts_at: "2026-10-08T14:00:00Z", ends_at: "2026-10-08T15:00:00Z" };

  it("sends session edits and deduplicated speaker links to one event-scoped RPC", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: rowId, error: null }), from: vi.fn() };
    mocks.requireAdmin.mockResolvedValue({ db, event: { id: eventId } });
    const response = await POST(request("agenda_sessions", "POST", { id: rowId, values: sessionValues, speaker_ids: [speakerId, speakerId] }), context("agenda_sessions"));
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("admin_save_agenda_session", { p_event: eventId, p_session: rowId, p_values: sessionValues, p_speaker_ids: [speakerId] });
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.invalidatePublicGuide).toHaveBeenCalledOnce();
  });

  it("does not run a second write or invalidate after an atomic save fails", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "A selected speaker is no longer available in this event." } }), from: vi.fn() };
    mocks.requireAdmin.mockResolvedValue({ db, event: { id: eventId } });
    const response = await POST(request("agenda_sessions", "POST", { id: rowId, values: sessionValues, speaker_ids: [speakerId] }), context("agenda_sessions"));
    expect(response.status).toBe(400);
    expect(db.from).not.toHaveBeenCalled();
    expect(mocks.invalidatePublicGuide).not.toHaveBeenCalled();
  });

  it("rejects invalid times and speaker arrays on unrelated resources", async () => {
    expect((await POST(request("agenda_sessions", "POST", { values: { ...sessionValues, ends_at: sessionValues.starts_at }, speaker_ids: [] }), context("agenda_sessions"))).status).toBe(400);
    expect((await POST(request("speakers", "POST", { values: { ...adminDefaults(adminResources.speakers), full_name: "Speaker" }, speaker_ids: [] }), context("speakers"))).status).toBe(400);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
  });

  it("refuses anonymous, Member, Sponsor and demo mutation requests", async () => {
    for (const [status, message] of [[401, "Please sign in"], [403, "Member cannot edit"], [403, "Sponsor cannot edit"], [409, "This organizer preview is read-only"]] as const) {
      mocks.requireAdmin.mockRejectedValue(new ApiError(status, message));
      const patched = await PATCH(request("speakers", "PATCH", { id: rowId, url: imageUrl }), context("speakers"));
      const saved = await POST(request("agenda_sessions", "POST", { values: sessionValues, speaker_ids: [] }), context("agenda_sessions"));
      expect(patched.status).toBe(status); expect(saved.status).toBe(status);
    }
    expect(mocks.invalidatePublicGuide).not.toHaveBeenCalled();
  });

  it("loads the current session's links and review warning using the same event and page ids", async () => {
    const chains = {
      agenda_sessions: query({ data: [{ id: rowId, title: "Session" }], error: null }),
      session_speakers: query({ data: [{ session_id: rowId, speaker_id: speakerId }], error: null }),
      agenda_import_notes: query({ data: [{ session_id: rowId, issue: "Confirm time", review_status: "confirmed" }], error: null }),
    };
    mocks.requireAdmin.mockResolvedValue({ db: { from: vi.fn((table: keyof typeof chains) => chains[table]) }, event: { id: eventId } });
    const response = await GET(new Request(`${origin}/api/admin/content/agenda_sessions`), context("agenda_sessions"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rows: [{ id: rowId, speaker_ids: [speakerId], import_note: { review_status: "confirmed" } }] });
    for (const chain of Object.values(chains)) expect(chain.eq).toHaveBeenCalledWith("event_id", eventId);
    expect(chains.session_speakers.in).toHaveBeenCalledWith("session_id", [rowId]);
  });
});
