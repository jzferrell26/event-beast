import type { Profile } from './types';

// Every member/sponsor endpoint uses this allowlist, even if the database later
// grows additional organizer-only fields. Never serialize a raw profile row.
export const PROFILE_FIELDS = ['attendee_id', 'event_id', 'full_name', 'company', 'title', 'city', 'state', 'bio', 'interests', 'headshot_path', 'directory_visible', 'messaging_available'] as const;
export const PROFILE_SELECT = 'attendee_id,event_id,full_name,company,title,city,state,bio,interests,headshot_path,directory_visible,messaging_available' as const;
export function directoryProfile(row: Profile): Profile {
  return Object.fromEntries([...PROFILE_FIELDS.map(field => [field, row[field]]), ...(row.avatar_url ? [['avatar_url', row.avatar_url]] : [])]) as unknown as Profile;
}
