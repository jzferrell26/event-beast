import { test, expect, type BrowserContext, type Route } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDatabase, ids, seedSecurityFixture } from "../db-harness";
import { demoGuide } from "../../src/lib/demo";
import type { Message } from "../../src/lib/types";

// Browser transport fixture backed by the actual PostgreSQL migrations/RLS.
// This qualifies the real Inbox UI and database behavior together. It does not
// claim to test hosted Supabase Auth, PostgREST or the WebSocket service.
test("two browser sessions reconcile durable sends, lost responses and blocking", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One paired browser scenario is sufficient; one context already uses a phone viewport.");
  test.setTimeout(60000);
  const db = await createDatabase();
  const contexts: BrowserContext[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T,>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
  try {
    await seedSecurityFixture(db);
    await db.query("update public.attendee_profiles set directory_visible=true,messaging_available=true where event_id=$1", [ids.event]);
    const threadId = (await asUser(db, ids.alice, () => db.query<{ id: string }>("select public.open_conversation($1,$2) as id", [ids.event, ids.bobAttendee]))).rows[0].id;
    const guide = structuredClone(demoGuide);
    guide.mode = "live"; guide.event.id = ids.event; guide.event.is_demo = false; guide.fetchedAt = new Date().toISOString();
    let loseNextAliceResponse = true;
    let sendAttempts = 0;

    async function mount(context: BrowserContext, user: string, attendee: string) {
      await context.route("**/api/**", async (route) => {
        await serialized(async () => {
          const url = new URL(route.request().url());
          const path = url.pathname;
          if (path === "/api/guide") return respond(route, guide);
          if (path === "/api/saved") return respond(route, { sessions: [], attendees: [] });
          try {
            await asUser(db, user, async () => {
              if (path === "/api/me") {
                const profile = (await db.query("select * from public.attendee_profiles where attendee_id=$1", [attendee])).rows[0];
                return respond(route, { mode: "live", authenticated: true, eligible: true, isAdmin: false, attendeeId: attendee, profile, preferences: { onboarding_step: 6, onboarding_done: true }, directoryAllowed: true });
              }
              if (path === "/api/moderation" && route.request().method() === "POST") {
                const body = route.request().postDataJSON();
                await db.query("select public.set_attendee_block($1,$2,$3)", [ids.event, body.target, body.blocked]);
                return respond(route, { saved: true });
              }
              if (path !== `/api/inbox/${threadId}`) return respond(route, { error: "Fixture endpoint unavailable" }, 404);
              const authorized = (await db.query<{ allowed: boolean }>("select public.can_read_conversation($1,$2) as allowed", [ids.event, threadId])).rows[0].allowed;
              if (!authorized) return respond(route, { error: "Conversation access denied" }, 403);
              const method = route.request().method();
              if (method === "POST") {
                sendAttempts += 1;
                const body = route.request().postDataJSON();
                const message = (await db.query<Message>("select m.* from public.send_message($1,$2,$3,$4) m", [ids.event, threadId, body.client_id, body.body])).rows[0];
                if (user === ids.alice && loseNextAliceResponse) {
                  loseNextAliceResponse = false;
                  return route.abort("failed");
                }
                return respond(route, { message }, 201);
              }
              if (method === "PATCH") {
                await db.query("select public.mark_conversation_read($1,$2,$3)", [ids.event, threadId, route.request().postDataJSON().lastReadId]);
                return respond(route, { saved: true });
              }
              return respond(route, await threadResponse(db, attendee, threadId, url));
            });
          } catch (error) {
            return respond(route, { error: error instanceof Error ? error.message : "Fixture error" }, 403);
          }
        });
      });
    }

    const alice = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const bob = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    contexts.push(alice, bob);
    await mount(alice, ids.alice, ids.aliceAttendee);
    await mount(bob, ids.bob, ids.bobAttendee);
    const a = await alice.newPage();
    const b = await bob.newPage();
    await a.goto(`/inbox/${threadId}`); await b.goto(`/inbox/${threadId}`);
    // Replace the intentionally static demo bootstrap with the live-shaped
    // guide fixture through the same refresh path as the production app.
    await a.evaluate(() => window.dispatchEvent(new Event("focus")));
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(a.getByLabel("Your message", { exact: true })).toBeEnabled();
    await expect(b.getByLabel("Your message", { exact: true })).toBeEnabled();

    await a.getByLabel("Your message", { exact: true }).fill("Hello from the phone browser");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.getByText("Not sent", { exact: true })).toBeVisible();
    expect((await serialized(() => db.query("select id from public.messages"))).rows).toHaveLength(1);
    await a.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(a.getByText("Not sent", { exact: true })).toHaveCount(0);
    await expect(a.locator(".message-bubble", { hasText: "Hello from the phone browser" })).toHaveCount(1);
    expect(sendAttempts).toBe(2);
    expect((await serialized(() => db.query("select id from public.messages"))).rows).toHaveLength(1);

    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(b.locator(".message-bubble", { hasText: "Hello from the phone browser" })).toBeVisible();
    await bob.setOffline(true);
    await expect(b.getByLabel("Your message", { exact: true })).toBeDisabled();
    await a.getByLabel("Your message", { exact: true }).fill("Saved while your connection is away");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.locator(".message-row.mine .message-meta").last()).toContainText("Sent");
    await bob.setOffline(false);
    await expect(b.locator(".message-bubble", { hasText: "Saved while your connection is away" })).toBeVisible();

    // A peer message is committed without broadcasting to Alice. Her next send
    // is acknowledged first; catching up must still fetch the intervening row.
    await serialized(() => asUser(db, ids.bob, () => db.query("select public.send_message($1,$2,gen_random_uuid(),'Incoming message before your reply')", [ids.event, threadId])));
    await a.getByLabel("Your message", { exact: true }).fill("Reply acknowledged before catch-up");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.locator(".message-bubble", { hasText: "Incoming message before your reply" })).toBeVisible();
    await expect(a.locator(".message-bubble", { hasText: "Reply acknowledged before catch-up" })).toHaveCount(1);

    await b.reload();
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(b.locator(".message-bubble")).toHaveCount(4);
    await b.getByRole("button", { name: "Conversation options" }).click();
    await b.getByRole("button", { name: "Block", exact: true }).click();
    await b.getByRole("button", { name: "Block attendee", exact: true }).click();
    await expect(b.getByLabel("Your message", { exact: true })).toBeDisabled();
    await a.getByLabel("Your message", { exact: true }).fill("This must be refused after the block");
    await a.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(a.getByText("Not sent", { exact: true })).toBeVisible();
    expect((await serialized(() => db.query("select id from public.messages"))).rows).toHaveLength(4);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await queue;
    await db.close();
  }
});

function respond(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: { "Cache-Control": "private, no-store" }, body: JSON.stringify(data) });
}

async function threadResponse(db: PGlite, attendee: string, conversation: string, url: URL) {
  const peerId = attendee === ids.aliceAttendee ? ids.bobAttendee : ids.aliceAttendee;
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const result = await db.query<Message>(`select * from public.messages where event_id=$1 and conversation_id=$2${after !== null ? " and id > $3" : before !== null ? " and id < $3" : ""} order by id ${after !== null ? "asc" : "desc"} limit 51`, [ids.event, conversation, ...(after !== null || before !== null ? [Number(after ?? before)] : [])]);
  const profile = (await db.query<{ full_name: string }>("select full_name from public.attendee_profiles where attendee_id=$1", [peerId])).rows[0];
  const block = (await db.query("select blocked_id from public.blocks where event_id=$1 and blocker_id=$2 and blocked_id=$3", [ids.event, attendee, peerId])).rows[0];
  const read = (await db.query<{ last_read_id: number }>("select last_read_id from public.conversation_reads where event_id=$1 and conversation_id=$2 and attendee_id=$3", [ids.event, conversation, peerId])).rows[0];
  const messages = result.rows.slice(0, 50);
  return { messages: after !== null ? messages : messages.reverse(), hasMore: result.rows.length > 50, peer: { id: peerId, name: profile?.full_name ?? "Private attendee" }, blockedByMe: Boolean(block), peerReadId: Number(read?.last_read_id ?? 0) };
}
