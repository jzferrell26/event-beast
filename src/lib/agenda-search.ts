import { sessionSpeakers } from './format';
import { plainDescription } from './description-format';
import type { Guide } from './types';
export function searchAgenda(guide: Guide, options: { dayId?: string; query: string; savedOnly: boolean; onlySaved: boolean; saved: string[] }) {
  const query = options.query.trim().toLocaleLowerCase();
  return guide.sessions.filter(session =>
    (Boolean(query) || options.savedOnly || session.day_id === options.dayId) &&
    (!options.onlySaved || options.saved.includes(session.id)) &&
    `${session.title} ${plainDescription(session.description)} ${session.room} ${sessionSpeakers(guide, session.id).map(speaker => speaker.full_name).join(' ')}`.toLocaleLowerCase().includes(query)
  ).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));
}
