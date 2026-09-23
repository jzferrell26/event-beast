import type { Message, PendingMessage } from "./types";

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const records = new Map(existing.map((message) => [Number(message.id), message]));
  for (const message of incoming) records.set(Number(message.id), { ...message, id: Number(message.id) });
  return [...records.values()].sort((a, b) => a.id - b.id);
}
export function unconfirmedMessages(pending: PendingMessage[], confirmed: Message[], senderId: string): PendingMessage[] {
  const keys = new Set(confirmed.filter((m) => m.sender_id === senderId).map((m) => m.client_id));
  return pending.filter((message) => !keys.has(message.client_id));
}
