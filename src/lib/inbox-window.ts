import type { ConversationSummary } from "./types";

export const INBOX_PAGE_SIZE = 30;
export const MAX_INBOX_PAGES = 334;
export interface InboxPage { conversations: ConversationSummary[]; hasMore: boolean }
export interface InboxWindow extends InboxPage { pages: number }

/** Re-read every visible page. Merging only the first page can drop a boundary
 * thread when an older conversation moves up, or preserve outdated private
 * rows. Only commit a complete fresh window; never a partly failed refresh. */
export async function loadInboxWindow(fetchPage: (offset: number) => Promise<InboxPage>, requestedPages: number): Promise<InboxWindow> {
  const limit = Number.isFinite(requestedPages) ? Math.min(MAX_INBOX_PAGES, Math.max(1, Math.trunc(requestedPages))) : 1;
  const conversations = new Map<string, ConversationSummary>();
  let hasMore = false;
  let pages = 0;
  for (let index = 0; index < limit; index++) {
    const page = await fetchPage(index * INBOX_PAGE_SIZE);
    pages += 1;
    for (const item of page.conversations) {
      // Moving rows can appear on adjacent offset pages. Prefer the first,
      // newer occurrence; the next invalidation refreshes the window again.
      if (!conversations.has(item.id)) conversations.set(item.id, item);
    }
    hasMore = page.hasMore;
    if (!hasMore) break;
  }
  return { conversations: [...conversations.values()], hasMore, pages };
}
