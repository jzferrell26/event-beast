import { test, expect } from "@playwright/test";
import type { ConversationSummary } from "../../src/lib/types";

test("a refreshed paged inbox preserves boundary threads and refreshes older metadata", async ({ page }) => {
  let rows: ConversationSummary[] = Array.from({ length: 60 }, (_, index) => ({
    id: `60000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`,
    peer_id: `30000000-0000-4000-9000-${String(index + 1).padStart(12, "0")}`,
    peer_name: `Attendee ${index + 1}`, peer_company: "Original company",
    peer_headshot_path: null, updated_at: new Date(Date.UTC(2026, 8, 26, 12, 0, 60 - index)).toISOString(),
    last_message: `Conversation ${index + 1}`, last_message_id: index + 1,
    last_sender_id: null, unread_count: 0, blocked_by_me: false, peer_read_id: 0,
  }));
  await page.route(/\/api\/inbox(?:\?.*)?$/, async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset")) || 0;
    await route.fulfill({ json: { conversations: rows.slice(offset, offset + 30), hasMore: rows.length > offset + 30 } });
  });
  await page.goto("/inbox");
  await expect(page.locator(".conversation-row")).toHaveCount(30);
  await page.getByRole("button", { name: "Older conversations", exact: true }).click();
  await expect(page.locator(".conversation-row")).toHaveCount(60);
  await expect(page.getByRole("button", { name: "Older conversations", exact: true })).toHaveCount(0);

  // An older thread receives a new message and moves across the first-page
  // boundary. Thread 30 must not disappear, and later-page data must refresh.
  rows[44] = { ...rows[44], peer_company: "Updated company", blocked_by_me: true };
  const newest = { ...rows[59], updated_at: new Date().toISOString(), last_message: "Newest reply", unread_count: 1 };
  rows = [newest, ...rows.slice(0, 59)];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".conversation-row").first()).toContainText("Attendee 60");
  await expect(page.locator(".conversation-row")).toHaveCount(60);
  await expect(page.locator(".conversation-row").filter({ has: page.getByRole("heading", { name: "Attendee 30", exact: true }) })).toHaveCount(1);
  const older = page.locator(".conversation-row").filter({ has: page.getByRole("heading", { name: "Attendee 45", exact: true }) });
  await expect(older).toContainText("Updated company");
  await expect(older).toContainText("You blocked this attendee");
  await expect(page.getByRole("button", { name: "Older conversations", exact: true })).toHaveCount(0);

  // A successful fresh list must not retain a row the server no longer returns.
  rows = rows.filter((row) => row.peer_name !== "Attendee 50");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".conversation-row")).toHaveCount(59);
  await expect(page.getByRole("heading", { name: "Attendee 50", exact: true })).toHaveCount(0);
});
