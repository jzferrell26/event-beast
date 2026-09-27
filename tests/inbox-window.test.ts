import { describe, expect, it } from "vitest";
import { loadInboxWindow, type InboxPage } from "../src/lib/inbox-window";
import type { ConversationSummary } from "../src/lib/types";

const conversation = (id: number, message = `Message ${id}`): ConversationSummary => ({
  id: String(id), peer_id: `peer-${id}`, peer_name: `Attendee ${id}`, peer_company: "",
  peer_headshot_path: null, updated_at: new Date(0).toISOString(), last_message: message,
  last_message_id: id, last_sender_id: null, unread_count: 0, blocked_by_me: false, peer_read_id: 0,
});
const pageFrom = (rows: ConversationSummary[]) => async (offset: number): Promise<InboxPage> => ({ conversations: rows.slice(offset, offset + 30), hasMore: rows.length > offset + 30 });

describe("inbox window refresh", () => {
  it("keeps the boundary thread when an older conversation moves to the first page", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => conversation(index + 1));
    const reordered = [conversation(60, "New reply"), ...rows.slice(0, 59)];
    const result = await loadInboxWindow(pageFrom(reordered), 2);
    expect(result.conversations).toHaveLength(60);
    expect(result.conversations[0].id).toBe("60");
    expect(result.conversations.some((row) => row.id === "30")).toBe(true);
    expect(result.hasMore).toBe(false);
    expect(result.pages).toBe(2);
  });
  it("uses the last loaded page for pagination and stops when the inbox shrinks", async () => {
    const offsets: number[] = [];
    const result = await loadInboxWindow(async (offset) => { offsets.push(offset); return pageFrom([conversation(1)])(offset); }, 3);
    expect(offsets).toEqual([0]);
    expect(result.pages).toBe(1);
    expect(result.hasMore).toBe(false);
  });
  it("deduplicates moving page boundaries without overwriting the newer page", async () => {
    const result = await loadInboxWindow(async (offset) => offset === 0
      ? { conversations: [conversation(1, "New reply")], hasMore: true }
      : { conversations: [conversation(1, "Stale reply"), conversation(2)], hasMore: false }, 2);
    expect(result.conversations.map((row) => row.last_message)).toEqual(["New reply", "Message 2"]);
  });
  it("rejects a partial failed refresh rather than confirming incomplete private data", async () => {
    await expect(loadInboxWindow(async (offset) => {
      if (offset) throw new Error("Access revoked");
      return { conversations: [conversation(1)], hasMore: true };
    }, 2)).rejects.toThrow("Access revoked");
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("normalizes invalid page requests (%s)", async (pages) => {
    const result = await loadInboxWindow(pageFrom([conversation(1)]), pages);
    expect(result.pages).toBe(1);
  });
});
