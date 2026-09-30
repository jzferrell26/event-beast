export type SessionType = "Keynote" | "Workshop" | "Panel" | "Networking" | "Break" | "Session";

export interface EventInfo {
  id: string; slug: string; name: string; tagline: string; timezone: string;
  start_date: string | null; end_date: string | null; published: boolean; public_guide: boolean; is_demo: boolean;
}
export interface EventSettings {
  event_id: string; welcome_title: string; welcome_body: string; support_email: string;
  support_location: string; technology_attribution: boolean; directory_enabled: boolean; messaging_enabled: boolean;
  agenda_notice?: string;
  community_enabled?: boolean; feed_enabled?: boolean; announcements_enabled?: boolean;
}
export interface AgendaDay { id: string; event_id: string; label: string; date: string; sort_order: number; published: boolean }
export interface AgendaSession {
  id: string; event_id: string; day_id: string; title: string; description: string;
  starts_at: string; ends_at: string; room: string; session_type: SessionType;
  sponsor_id: string | null; published: boolean; is_demo: boolean;
  end_time_confirmed?: boolean;
}
export interface Speaker { id: string; event_id: string; full_name: string; title: string; bio: string; headshot_url: string; published: boolean; is_demo: boolean; source_url?: string }
export interface SponsorTier { id: string; event_id: string; name: string; sort_order: number }
export interface Sponsor {
  id: string; event_id: string; tier_id: string | null; name: string; description: string;
  logo_url: string; booth: string; cta_label: string; cta_url: string; featured: boolean;
  sort_order: number; published: boolean; is_demo: boolean;
  content_version?: number; updated_at?: string;
}
export interface SponsorPlacement {
  id: string; event_id: string; day_id: string | null; after_session_id: string | null; sponsor_id: string;
  headline: string; body: string; sort_order: number; published: boolean;
  image_url?: string; image_alt?: string; image_format?: 'square' | 'banner'; link_url?: string;
  surface?: 'agenda' | 'home' | 'speakers' | 'sponsors' | 'lunch' | 'venue';
}
export interface LunchLocation {
  id: string; event_id: string; title: string; location: string; hours: string; description: string;
  dietary_info: string; directions_url: string; image_url: string; sort_order: number; published: boolean; is_demo: boolean;
  event_date?: string | null; category?: 'VIP' | 'Breakout' | 'Seating' | 'Food Truck' | 'Lunch'; menu_url?: string;
}
export interface VenueLocation {
  id: string; event_id: string; title: string; location: string; description: string;
  directions_url: string; map_url: string; sort_order: number; published: boolean; is_demo: boolean;
}
export interface Announcement {
  id: string; event_id: string; title: string; body: string; severity: "info" | "important" | "urgent";
  starts_at: string | null; expires_at: string | null; published: boolean; is_demo: boolean; created_at: string;
}
export interface EventActivity {
  id: string; event_id: string; title: string; activity_type: 'Activity' | 'Party' | 'Breakout' | 'Book Signing' | 'Fitness' | 'Wellness' | 'Networking' | 'Other';
  starts_at: string | null; ends_at: string | null; location: string; description: string; host: string; capacity_note: string;
  sort_order: number; published: boolean; is_demo: boolean;
}
export interface FeedPost {
  id: string; event_id?: string; author_id: string; body: string; status: 'visible' | 'hidden' | 'deleted'; version: number;
  created_at: string; updated_at: string; author_name?: string; author_company?: string; author_title?: string; avatar_url?: string;
}
export interface Guide {
  publicSite?: boolean;
  communityEnabled?: boolean;
  mode: "demo" | "live"; event: EventInfo; settings: EventSettings;
  days: AgendaDay[]; sessions: AgendaSession[]; speakers: Speaker[];
  sessionSpeakers: { id?: string; event_id: string; session_id: string; speaker_id: string }[];
  sponsors: Sponsor[]; tiers: SponsorTier[]; placements: SponsorPlacement[];
  lunches: LunchLocation[]; venues: VenueLocation[]; announcements: Announcement[]; activities?: EventActivity[]; fetchedAt: string;
}
export interface Profile {
  attendee_id: string; event_id: string; full_name: string; company: string; title: string;
  city: string; state: string; bio: string; interests: string[]; headshot_path: string | null;
  directory_visible: boolean; messaging_available: boolean; avatar_url?: string;
}
export interface Preferences { onboarding_step: number; onboarding_done: boolean }
export interface Me {
  mode: "demo" | "live"; authenticated: boolean; eligible: boolean; isAdmin: boolean;
  attendeeId: string | null; email?: string; profile: Profile | null; preferences: Preferences | null;
  directoryAllowed?: boolean; status?: string;
  role?: "admin" | "sponsor" | "member" | null; sponsorIds?: string[];
}
export interface Message {
  id: number; event_id: string; conversation_id: string; sender_id: string;
  client_id: string; body: string; created_at: string;
}
export interface PendingMessage { client_id: string; body: string; created_at: string; status: "pending" | "failed"; error?: string }
export interface ConversationSummary {
  id: string; peer_id: string; peer_name: string; peer_company: string; peer_headshot_path: string | null;
  avatar_url?: string; updated_at: string; last_message: string | null; last_message_id: number | null;
  last_sender_id: string | null; unread_count: number; blocked_by_me: boolean; peer_read_id: number;
}
export interface SavedItems { sessions: string[]; attendees: string[] }
