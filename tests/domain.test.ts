import { describe, expect, it } from "vitest";
import { parseAttendeeCsv, messageSchema, profileSchema } from "../src/lib/validation";
import { safeNext, sessionState } from "../src/lib/format";
import { adminDefaults, getAdminResource, resourceSchema, instantToWall, wallToInstant } from "../src/lib/admin-resources";
import { mergeMessages, unconfirmedMessages } from "../src/lib/message-state";
import { demoGuide } from "../src/lib/demo";
import type { Message, PendingMessage } from "../src/lib/types";

describe("registration import validation", () => {
  it("normalizes registration email without publishing optional CRM fields", () => {
    const parsed = parseAttendeeCsv('email,name,company,phone\n JANE@EXAMPLE.COM ,Jane Example,Private Company,555-0000');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([{ email: "jane@example.com", name: "Jane Example", phone: "555-0000" }]);
  });
  it("supports a BOM and quoted commas in names", () => {
    expect(parseAttendeeCsv('\uFEFFemail,name\na@example.com,"Example, Alex"').rows).toEqual([{ email: "a@example.com", name: "Example, Alex" }]);
  });
  it("rejects repeated emails regardless of case", () => {
    expect(parseAttendeeCsv('email,name\na@example.com,Alex\nA@EXAMPLE.COM,Other Alex').errors.length).toBeGreaterThan(0);
  });
  it("reports missing headers and invalid email rows", () => {
    expect(parseAttendeeCsv('email,full_name\nnot-an-email,Alex').errors.length).toBeGreaterThan(0);
  });
  it("rejects duplicate header names", () => {
    expect(parseAttendeeCsv('email,name,name\na@example.com,Alex,Other').errors.length).toBeGreaterThan(0);
  });
  it("rejects empty and oversized rosters", () => {
    expect(parseAttendeeCsv('email,name').errors.length).toBeGreaterThan(0);
    expect(parseAttendeeCsv('email,name\n' + Array.from({ length: 1001 }, (_, i) => `p${i}@example.com,Person ${i}`).join('\n')).errors.length).toBeGreaterThan(0);
  });
});

describe("event date and redirect boundaries", () => {
  it("uses the event timezone rather than the organizer browser timezone", () => {
    expect(wallToInstant("2026-10-08T09:00", "America/Chicago")).toBe("2026-10-08T14:00:00.000Z");
    expect(instantToWall("2026-10-08T14:00:00Z", "America/Chicago")).toBe("2026-10-08T09:00");
  });
  it("rejects nonexistent and ambiguous daylight-saving clock times", () => {
    expect(() => wallToInstant("2026-03-08T02:30", "America/Chicago")).toThrow();
    expect(() => wallToInstant("2026-11-01T01:30", "America/Chicago")).toThrow();
  });
  it("has exact session start and end boundaries", () => {
    const session = demoGuide.sessions[0];
    expect(sessionState(session, Date.parse(session.starts_at) - 1)).toBe("upcoming");
    expect(sessionState(session, Date.parse(session.starts_at))).toBe("now");
    expect(sessionState(session, Date.parse(session.ends_at))).not.toBe("now");
  });
  it("allows only internal routes after authentication", () => {
    expect(safeNext("/agenda")).toBe("/agenda");
    for (const value of ["https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)"]) expect(safeNext(value)).toBe("/");
  });
});

describe("message reconciliation", () => {
  const message = (id: number, sender = "alice", client = `client-${id}`): Message => ({ id, event_id: "event", conversation_id: "conversation", sender_id: sender, client_id: client, body: `Message ${id}`, created_at: "2026-10-08T14:00:00Z" });
  it("merges reconnect pages in durable order without duplicates", () => {
    expect(mergeMessages([message(3), message(1)], [message(2), message(3)]).map((m) => m.id)).toEqual([1, 2, 3]);
  });
  it("clears pending only when the same sender and idempotency key are confirmed", () => {
    const pending: PendingMessage[] = [{ client_id: "retry-key", body: "Hello", status: "failed", created_at: "2026-10-08T14:00:00Z" }];
    expect(unconfirmedMessages(pending, [message(1, "bob", "retry-key")], "alice")).toEqual(pending);
    expect(unconfirmedMessages(pending, [message(1, "alice", "retry-key")], "alice")).toEqual([]);
  });
  it("rejects whitespace-only and overlong sends", () => {
    const client_id = "10000000-0000-4000-8000-000000000001";
    expect(messageSchema.safeParse({ client_id, body: "   " }).success).toBe(false);
    expect(messageSchema.safeParse({ client_id, body: "a".repeat(4001) }).success).toBe(false);
  });
});

describe("constrained organizer forms", () => {
  it("does not expose arbitrary database resources", () => {
    expect(getAdminResource("messages")).toBeNull();
    expect(getAdminResource("event_admins")).toBeNull();
    expect(getAdminResource("__proto__")).toBeNull();
  });
  it("rejects unknown mutation fields and insecure sponsor URLs", () => {
    const resource = getAdminResource("sponsors")!;
    const valid = { ...adminDefaults(resource), name: "Confirmed sponsor" };
    expect(resourceSchema(resource).safeParse(valid).success).toBe(true);
    expect(resourceSchema(resource).safeParse({ ...valid, event_id: "other-event" }).success).toBe(false);
    expect(resourceSchema(resource).safeParse({ ...valid, cta_url: "javascript:alert(1)" }).success).toBe(false);
  });
  it("validates end times after start times", () => {
    const resource = getAdminResource("agenda_sessions")!;
    const values = Object.fromEntries(resource.fields.map((field) => [field.key, demoGuide.sessions[0][field.key as keyof typeof demoGuide.sessions[number]]]));
    expect(resourceSchema(resource).safeParse(values).success).toBe(true);
    expect(resourceSchema(resource).safeParse({ ...values, ends_at: values.starts_at }).success).toBe(false);
  });
  it("does not accept registration or role fields as profile edits", () => {
    expect(Object.keys(profileSchema.shape)).not.toContain("registration_email");
    expect(Object.keys(profileSchema.shape)).not.toContain("user_id");
    expect(Object.keys(profileSchema.shape)).not.toContain("role");
  });
});
