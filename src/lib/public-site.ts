import type { Guide, SavedItems } from './types';

/** Public information remains available while member/community modules may be enabled separately. */
export function publicSiteEnabled(value = process.env.EVENT_BEAST_PUBLIC_SITE): boolean {
  return value !== 'false';
}

export function publicRouteDecision(path: string): { redirect?: string; disabled?: boolean } {
  if (/^\/api\/(sponsor)(\/|$)/.test(path)
    || /^\/api\/sponsors\/[^/]+\/representatives\/?$/.test(path)) return { disabled: true };
  if (/^\/(sponsor|more\/sponsors)(\/|$)/.test(path)) return { redirect: '/sponsors' };
  return {};
}

/** Do not ship legacy sponsor booth/profile copy or speaker source links in the public payload. */
export function publicSiteGuide(guide: Guide, enabled: boolean): Guide {
  if (!enabled) return { ...guide, publicSite: false };
  return {
    ...guide, publicSite: true,
    sponsors: guide.sponsors.map(sponsor => ({ ...sponsor, booth: '', description: '' })),
    speakers: guide.speakers.map(speaker => ({ ...speaker, source_url: '' })),
  };
}

export function deviceBookmarkKey(eventId: string): string { return `event-beast:public:${eventId}:sessions`; }

export function parseDeviceBookmarks(raw: string | null): SavedItems {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return { sessions: Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].slice(0, 1000) : [], attendees: [] };
  } catch { return { sessions: [], attendees: [] }; }
}
