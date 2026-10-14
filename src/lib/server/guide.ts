import 'server-only';
import { cache } from 'react';
import { unstable_cache, revalidateTag } from 'next/cache';
import { demoGuide } from '../demo';
import type { Guide } from '../types';
import { publicSupabase } from '../supabase/server';
import { databaseError } from './http';
import { publicSiteEnabled, publicSiteGuide } from '../public-site';
import { eventGuideContent } from './event-guide-content';

export const isDemo = () => process.env.EVENT_BEAST_DEMO_MODE === 'true';
export const eventSlug = () => process.env.EVENT_BEAST_EVENT_SLUG || process.env.NEXT_PUBLIC_EVENT_SLUG || 'momentum-builder-live-2026';
const PUBLIC_GUIDE_TAG = 'event-beast-public-guide';
export function invalidatePublicGuide() { revalidateTag(PUBLIC_GUIDE_TAG, { expire: 0 }); }
const loadPublicGuide = async (slug: string): Promise<Guide | null> => {
  const db = publicSupabase();
  if (!db) return null;
  const eventResult = await db.from('events').select('id,slug,name,tagline,timezone,start_date,end_date,published,public_guide,is_demo')
    .eq('slug', slug).eq('published', true).eq('public_guide', true).maybeSingle();
  databaseError(eventResult.error);
  if (!eventResult.data) return null;
  return eventGuideContent(db, eventResult.data as Guide['event']);
};
// This cache remains exclusive to the legacy public guide. New customer routes
// resolve their explicit organization/event and currently render uncached.
const cachedPublicGuide = unstable_cache(loadPublicGuide, ['public-guide-v2', process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unconfigured'], { revalidate: 15, tags: [PUBLIC_GUIDE_TAG] });
export const getGuide = cache(async (): Promise<Guide | null> => {
  const guide = isDemo() ? demoGuide : await cachedPublicGuide(eventSlug());
  return guide ? publicSiteGuide(guide, publicSiteEnabled()) : null;
});
