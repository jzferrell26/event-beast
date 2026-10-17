import type { PlatformEvent } from './platform';

export const setupResources = ['agenda_days', 'agenda_sessions', 'speakers', 'sponsors', 'venue_locations'] as const;
export type SetupResource = typeof setupResources[number];
export type SetupSection = 'details' | 'event_settings' | SetupResource;
export interface SetupCount { total: number; included: number }
export interface SetupContent {
  counts: Record<SetupResource, SetupCount>;
  welcomeAdded: boolean;
  sessionsOnHiddenDays: number;
}
export interface SetupCheck {
  id: string;
  section: SetupSection;
  title: string;
  description: string;
  action: string;
  required: boolean;
  complete: boolean;
  attention: boolean;
}
export interface EventSetup {
  eventId: string;
  checkedAt: string;
  checks: SetupCheck[];
  completed: number;
  total: number;
  canPublish: boolean;
  sessionsOnHiddenDays: number;
}

/** Describe saved guide content. Only the existing date requirement blocks publishing. */
export function buildEventSetup(
  event: Pick<PlatformEvent, 'id' | 'name' | 'start_date' | 'end_date' | 'timezone' | 'brand_logo_url'>,
  content: SetupContent,
  checkedAt = new Date().toISOString(),
): EventSetup {
  const datesReady = Boolean(event.start_date && event.end_date && event.end_date >= event.start_date);
  const checks: SetupCheck[] = [
    { id: 'dates', section: 'details', title: 'Event dates', required: true, complete: datesReady, attention: !datesReady,
      description: datesReady ? `Dates saved. Event times use ${event.timezone}.` : 'Add a first and last event date before publishing.', action: 'Set event dates' },
    { id: 'branding', section: 'details', title: 'Event branding', required: false, complete: Boolean(event.brand_logo_url), attention: false,
      description: event.brand_logo_url ? 'A logo is saved. Check its appearance in the preview.' : 'Add a logo to make the guide recognizable. The event name works on its own.', action: 'Edit branding' },
    { id: 'welcome', section: 'event_settings', title: 'Welcome & practical details', required: false, complete: content.welcomeAdded, attention: false,
      description: content.welcomeAdded ? 'Your welcome message is saved.' : 'Tell guests what to expect and where to find help.', action: 'Edit welcome' },
  ];
  const sections: { section: SetupResource; title: string; singular: string; plural: string; action: string; empty: string }[] = [
    { section: 'agenda_days', title: 'Event days', singular: 'day', plural: 'days', action: 'Manage event days', empty: 'Add the days that will organize your agenda.' },
    { section: 'agenda_sessions', title: 'Agenda', singular: 'session', plural: 'sessions', action: 'Build agenda', empty: 'Add sessions and times so guests can plan their day.' },
    { section: 'speakers', title: 'Speakers', singular: 'speaker', plural: 'speakers', action: 'Manage speakers', empty: 'Introduce your speakers when they are part of the event.' },
    { section: 'sponsors', title: 'Sponsors', singular: 'sponsor', plural: 'sponsors', action: 'Manage sponsors', empty: 'Add the organizations supporting your event, when applicable.' },
    { section: 'venue_locations', title: 'Venue', singular: 'location', plural: 'locations', action: 'Manage venue', empty: 'Help guests find the venue and meeting spaces, when applicable.' },
  ];
  for (const item of sections) {
    const count = content.counts[item.section];
    const excluded = Math.max(0, count.total - count.included);
    const visible = `${count.included} ${count.included === 1 ? item.singular : item.plural} included in the guide.`;
    const hiddenDayWarning = item.section === 'agenda_sessions' && content.sessionsOnHiddenDays > 0
      ? ` ${content.sessionsOnHiddenDays} marked Published ${content.sessionsOnHiddenDays === 1 ? 'session is' : 'sessions are'} hidden because the event day is a draft. Open Event days to publish the day.` : '';
    checks.push({
      id: item.section, section: item.section, title: item.title, action: item.action, required: false,
      complete: count.included > 0 && excluded === 0, attention: excluded > 0,
      description: count.total === 0 ? item.empty : `${visible}${excluded ? ` ${excluded} saved ${excluded === 1 ? item.singular : item.plural} ${excluded === 1 ? 'is' : 'are'} not included yet.` : ''}${hiddenDayWarning}`,
    });
  }
  return { eventId: event.id, checkedAt, checks, completed: checks.filter(check => check.complete).length,
    total: checks.length, canPublish: datesReady, sessionsOnHiddenDays: content.sessionsOnHiddenDays };
}
