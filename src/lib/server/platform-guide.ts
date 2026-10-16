import 'server-only';
import { cache } from 'react';
import { publicSupabase } from '../supabase/server';
import type { Guide } from '../types';
import type { PlatformEvent } from '../platform';
import { databaseError } from './http';
import { platformEnabled, platformIdentity, platformEvent } from './platform-auth';
import { eventGuideContent } from './event-guide-content';

export type PlatformGuide = Guide & { event: PlatformEvent };
export const publicPlatformGuide = cache(async (organizationSlug: string, slug: string): Promise<PlatformGuide | null> => {
  if (!platformEnabled()) return null;
  const db = publicSupabase();
  if (!db) return null;
  const result = await db.from('events').select('id,organization_id,organization_slug,slug,name,tagline,timezone,start_date,end_date,published,public_guide,is_demo,brand_logo_url,platform_version')
    .eq('organization_slug', organizationSlug).eq('slug', slug).eq('published', true).eq('public_guide', true).maybeSingle();
  databaseError(result.error);
  if (!result.data) return null;
  return await eventGuideContent(db, result.data as PlatformEvent) as PlatformGuide;
});
export async function previewPlatformGuide(organizationSlug: string, eventId: string): Promise<PlatformGuide> {
  const actor = await platformIdentity();
  const scope = await platformEvent(actor, organizationSlug, eventId);
  return await eventGuideContent(scope.db, scope.event) as PlatformGuide;
}
