import 'server-only';
import type { Guide } from '../types';
import type { publicSupabase } from '../supabase/server';
import { databaseError } from './http';

/** A single public projection for the legacy event and customer event guides.
 * A private preview uses the caller's RLS client but the same published content. */
export async function eventGuideContent(db: NonNullable<ReturnType<typeof publicSupabase>>, event: Guide['event']): Promise<Guide> {
  const [settings, days, sessions, speakers, links, sponsors, tiers, placements, lunches, venues, announcements, activities] = await Promise.all([
    db.from('event_settings').select('*').eq('event_id', event.id).single(),
    db.from('agenda_days').select('*').eq('event_id', event.id).eq('published', true).order('sort_order'),
    db.from('agenda_sessions').select('*').eq('event_id', event.id).eq('published', true).order('starts_at'),
    db.from('speakers').select('*').eq('event_id', event.id).eq('published', true),
    db.from('session_speakers').select('event_id,session_id,speaker_id').eq('event_id', event.id),
    db.from('sponsors').select('*').eq('event_id', event.id).eq('published', true).order('sort_order'),
    db.from('sponsor_tiers').select('*').eq('event_id', event.id).order('sort_order'),
    db.from('agenda_sponsor_placements').select('*').eq('event_id', event.id).eq('published', true).order('sort_order'),
    db.from('lunch_locations').select('*').eq('event_id', event.id).eq('published', true).order('sort_order'),
    db.from('venue_locations').select('*').eq('event_id', event.id).eq('published', true).order('sort_order'),
    db.from('announcements').select('*').eq('event_id', event.id).eq('published', true).order('created_at', { ascending: false }),
    db.from('event_activities').select('*').eq('event_id', event.id).eq('published', true).order('starts_at').order('sort_order'),
  ]);
  [settings, days, sessions, speakers, links, sponsors, tiers, placements, lunches, venues, announcements, activities].forEach(result => databaseError(result.error));
  const publishedDays = new Set((days.data ?? []).map(day => day.id));
  const publishedSponsors = new Set((sponsors.data ?? []).map(sponsor => sponsor.id));
  return {
    mode: 'live', event, settings: settings.data,
    days: days.data ?? [], sessions: (sessions.data ?? []).filter(session => publishedDays.has(session.day_id)),
    speakers: speakers.data ?? [], sessionSpeakers: links.data ?? [], sponsors: sponsors.data ?? [], tiers: tiers.data ?? [],
    placements: (placements.data ?? []).filter(placement => (placement.surface && placement.surface !== 'agenda' || publishedDays.has(placement.day_id)) && publishedSponsors.has(placement.sponsor_id)),
    lunches: lunches.data ?? [], venues: venues.data ?? [], announcements: announcements.data ?? [], activities: activities.data ?? [], fetchedAt: new Date().toISOString(),
  } as Guide;
}
