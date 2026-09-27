import { describe, expect, it } from "vitest";
import { ingestMessageBatch, unconfirmedMessages } from "../src/lib/message-state";
import type { Message, PendingMessage } from "../src/lib/types";

const message = (id: number, sender = "peer", client_id = `message-${id}`): Message => ({ id, sender_id: sender, client_id, event_id: "event", conversation_id: "thread", body: `Message ${id}`, created_at: "2026-10-08T14:00:00Z" });

describe("outgoing acknowledgements and reconnect history", () => {
  it("does not skip an incoming message when a newer outgoing send is acknowledged first", () => {
    let timeline = ingestMessageBatch({ messages: [], cursor: 0 }, [message(10)], "catchup");
    // The server stores peer message 11, then our send 12. Its HTTP response
    // arrives before Realtime/focus reconciliation has loaded message 11.
    timeline = ingestMessageBatch(timeline, [message(12, "self")], "send");
    expect(timeline.messages.map((m) => m.id)).toEqual([10, 12]);
    expect(timeline.cursor).toBe(10);
    const serverRows = [message(11), message(12, "self")];
    timeline = ingestMessageBatch(timeline, serverRows.filter((m) => m.id > timeline.cursor), "catchup");
    expect(timeline.messages.map((m) => m.id)).toEqual([10, 11, 12]);
    expect(timeline.cursor).toBe(12);
  });
  it("preserves the catch-up position when loading older history or retrying a confirmed send", () => {
    let timeline = ingestMessageBatch({ messages: [], cursor: 0 }, [message(50)], "catchup");
    timeline = ingestMessageBatch(timeline, [message(10)], "history");
    timeline = ingestMessageBatch(timeline, [message(50)], "send");
    expect(timeline.cursor).toBe(50);
    expect(timeline.messages.map((m) => m.id)).toEqual([10, 50]);
  });
  it("reconciles a failed response by the original sender and client key", () => {
    const pending: PendingMessage[] = [{ client_id: "retry-me", body: "Hello", status: "failed", created_at: "2026-10-08T14:00:00Z" }];
    const timeline = ingestMessageBatch({ messages: [], cursor: 0 }, [message(1, "self", "retry-me")], "catchup");
    expect(unconfirmedMessages(pending, timeline.messages, "self")).toEqual([]);
    expect(unconfirmedMessages(pending, timeline.messages, "someone-else")).toEqual(pending);
  });
});
