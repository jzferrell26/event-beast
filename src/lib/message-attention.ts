export interface MessageAttention { unread: number; latestId: string | null; conversationId: string | null }
export const EMPTY_ATTENTION: MessageAttention = { unread: 0, latestId: null, conversationId: null };

/** IDs are compared without converting PostgreSQL bigint to a lossy number. */
export function newerMessageId(next: string | null, previous: string | null): boolean {
  return Boolean(next && previous && /^\d+$/.test(next) && /^\d+$/.test(previous) && BigInt(next) > BigInt(previous));
}
export function shouldShowMessageNotice(next: MessageAttention, prior: MessageAttention | null, path: string): boolean {
  if (!prior || next.unread < 1 || !next.conversationId || path === '/inbox/' + next.conversationId) return false;
  // A first empty baseline has no ID; a later first message is genuinely new.
  return next.latestId !== null && (prior.latestId === null || newerMessageId(next.latestId, prior.latestId));
}
export function messageCountLabel(count: number) { return `${count} unread ${count === 1 ? 'message' : 'messages'}`; }
