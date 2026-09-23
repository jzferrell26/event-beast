import type { Guide, Profile, ConversationSummary, Message, Me } from "./types";

export const DEMO_EVENT_ID = "10000000-0000-4000-8000-000000000026";
const e = DEMO_EVENT_ID;
const id = (group: number, n: number) => `${group}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dayOne = id(4, 1), dayTwo = id(4, 2);

// All dates, program details, venues and sample people below are illustrative.
// Cuantico's Platinum sponsorship is the only confirmed sponsor fact supplied.
export const demoGuide: Guide = {
  mode: "demo",
  event: {
    id: e, slug: "momentum-builder-live-2026", name: "Momentum Builder LIVE 2026",
    tagline: "Build relationships. Create momentum.", timezone: "America/Chicago",
    start_date: "2026-10-08", end_date: "2026-10-09", published: true, public_guide: true, is_demo: true,
  },
  settings: {
    event_id: e, welcome_title: "Welcome to Momentum Builder LIVE 2026",
    welcome_body: "Big ideas. Real connections. Your next move starts here.",
    support_email: "", support_location: "Ask the welcome desk for help. Exact venue details will be supplied by the organizer.",
    technology_attribution: true, directory_enabled: true, messaging_enabled: true,
  },
  days: [
    { id: dayOne, event_id: e, label: "Day 01", date: "2026-10-08", sort_order: 1, published: true },
    { id: dayTwo, event_id: e, label: "Day 02", date: "2026-10-09", sort_order: 2, published: true },
  ],
  sessions: [
    [1, dayOne, "Welcome & the momentum mindset", "Set your intention for the event and meet the people building alongside you.", "2026-10-08T14:00:00Z", "2026-10-08T14:45:00Z", "Main stage · Sample", "Keynote"],
    [2, dayOne, "The next chapter of your business", "A practical conversation about the choices, systems and relationships that unlock growth.", "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z", "Main stage · Sample", "Panel"],
    [3, dayOne, "Make room for meaningful connections", "Trade ideas with another attendee. This is your time to connect and explore the sponsor lounge.", "2026-10-08T16:00:00Z", "2026-10-08T16:30:00Z", "Lounge · Sample", "Networking"],
    [4, dayOne, "From busy to built: systems that scale", "Turn a repeated task into a reliable process. Bring a challenge from your own business.", "2026-10-08T16:30:00Z", "2026-10-08T17:30:00Z", "Workshop room · Sample", "Workshop"],
    [5, dayOne, "Lunch & conversations", "Recharge, meet someone new and make a plan for the afternoon.", "2026-10-08T17:30:00Z", "2026-10-08T18:30:00Z", "Lunch area · Sample", "Break"],
    [6, dayOne, "Your next 90 days", "Leave the room with a focused set of actions and the people who can help you follow through.", "2026-10-08T18:30:00Z", "2026-10-08T19:30:00Z", "Main stage · Sample", "Workshop"],
    [7, dayTwo, "Start with the relationship", "A sample opening session on strengthening your network and serving your partners.", "2026-10-09T14:00:00Z", "2026-10-09T15:00:00Z", "Main stage · Sample", "Keynote"],
    [8, dayTwo, "AI that earns its place in your workflow", "Identify opportunities for useful automation and build a clear implementation plan.", "2026-10-09T15:15:00Z", "2026-10-09T16:15:00Z", "Workshop room · Sample", "Workshop"],
    [9, dayTwo, "The partner playbook", "A sample panel exploring repeatable ways to build strong business partnerships.", "2026-10-09T16:30:00Z", "2026-10-09T17:30:00Z", "Main stage · Sample", "Panel"],
    [10, dayTwo, "Keep the momentum going", "Turn the ideas you have gathered into a clear next step.", "2026-10-09T18:30:00Z", "2026-10-09T19:15:00Z", "Main stage · Sample", "Session"],
  ].map(([n, day, title, description, start, end, room, type]) => ({
    id: id(5, Number(n)), event_id: e, day_id: String(day), title: String(title), description: String(description),
    starts_at: String(start), ends_at: String(end), room: String(room), session_type: type as Guide["sessions"][number]["session_type"],
    sponsor_id: null, published: true, is_demo: true,
  })),
  speakers: [
    { id: id(8, 1), event_id: e, full_name: "Event host · Sample", title: "Speaker to be confirmed", bio: "This is a placeholder for the organizer-approved speaker biography.", headshot_url: "", published: true, is_demo: true },
    { id: id(8, 2), event_id: e, full_name: "Guest speaker · Sample", title: "Speaker to be confirmed", bio: "The organizer will provide the confirmed speaker details.", headshot_url: "", published: true, is_demo: true },
  ],
  sessionSpeakers: [1, 2, 4, 6, 7, 8, 9, 10].map((n) => ({ event_id: e, session_id: id(5, n), speaker_id: id(8, n % 2 ? 1 : 2) })),
  tiers: [
    { id: id(9, 1), event_id: e, name: "Platinum", sort_order: 10 },
    { id: id(9, 2), event_id: e, name: "Gold · Sample", sort_order: 20 },
    { id: id(9, 3), event_id: e, name: "Silver · Sample", sort_order: 30 },
  ],
  sponsors: [
    { id: id(6, 1), event_id: e, tier_id: id(9, 1), name: "Cuantico AI", description: "AI and automation for the conversations that move business forward. Platinum sponsorship confirmed by Cuantico. Booth and activation details are awaiting organizer confirmation.", logo_url: "", booth: "Details coming soon", cta_label: "Explore Cuantico", cta_url: "", featured: false, sort_order: 100, published: true, is_demo: false },
    { id: id(6, 2), event_id: e, tier_id: id(9, 2), name: "Growth Lab · Sample", description: "A sample sponsor profile showing how attendees can discover partners, find a booth and learn more.", logo_url: "", booth: "Sample booth 02", cta_label: "Learn more", cta_url: "", featured: false, sort_order: 100, published: true, is_demo: true },
    { id: id(6, 3), event_id: e, tier_id: id(9, 3), name: "The Partner Network · Sample", description: "This sample placement demonstrates the sponsor directory. No real sponsor agreement is implied.", logo_url: "", booth: "Sample booth 03", cta_label: "Meet the team", cta_url: "", featured: false, sort_order: 100, published: true, is_demo: true },
  ],
  placements: [{ id: id(7, 1), event_id: e, day_id: dayOne, after_session_id: id(5, 2), sponsor_id: id(6, 2), headline: "Good conversations start here.", body: "Explore the sponsor lounge · Sample placement", sort_order: 1, published: true }],
  lunches: [
    { id: id(2, 1), event_id: e, title: "The midday reset", location: "Lunch area · Sample location", hours: "12:30–1:30 PM · Sample time", description: "A place to recharge and keep the conversation going. The organizer will confirm the menu and exact location.", dietary_info: "Menu and dietary information have not yet been provided. Ask the event team before selecting a meal.", directions_url: "", image_url: "", sort_order: 1, published: true, is_demo: true },
  ],
  venues: [
    { id: id(3, 1), event_id: e, title: "Welcome desk", location: "Main entrance · Sample location", description: "Your first stop for event check-in and app help. Exact location will be confirmed by the organizer.", directions_url: "", map_url: "", sort_order: 1, published: true, is_demo: true },
    { id: id(3, 2), event_id: e, title: "Main stage", location: "Main hall · Sample location", description: "Keynotes, panels and the big conversations. The final venue map will appear here when provided.", directions_url: "", map_url: "", sort_order: 2, published: true, is_demo: true },
    { id: id(3, 3), event_id: e, title: "Sponsor lounge", location: "Exhibit area · Sample location", description: "Find the partners supporting the event and meet the people behind their businesses.", directions_url: "", map_url: "", sort_order: 3, published: true, is_demo: true },
  ],
  announcements: [{ id: id(1, 1), event_id: e, title: "Your event companion is taking shape", body: "Explore this sample program. Dates, speakers, locations and menus are illustrative until the organizer publishes the official details.", severity: "info", starts_at: null, expires_at: null, published: true, is_demo: true, created_at: "2026-09-22T20:00:00Z" }],
  fetchedAt: "2026-09-22T20:00:00Z",
};

export const networkingInterests = ["AI & automation", "Referral partners", "Team growth", "Marketing", "Leadership", "Operations", "Business development"];
export const demoProfiles: Profile[] = [
  [1, "Alex Rivera · Sample", "Sample mortgage team", "Branch leader", "Austin", "Texas", ["Leadership", "Team growth"]],
  [2, "Jordan Lee · Sample", "Sample lending company", "Loan officer", "Dallas", "Texas", ["AI & automation", "Referral partners"]],
  [3, "Morgan Ellis · Sample", "Sample real estate group", "Broker owner", "Denver", "Colorado", ["Referral partners", "Marketing"]],
  [4, "Casey Brooks · Sample", "Sample growth agency", "Founder", "Nashville", "Tennessee", ["Marketing", "Business development"]],
  [5, "Taylor Quinn · Sample", "Sample operations team", "Operations leader", "Phoenix", "Arizona", ["Operations", "AI & automation"]],
  [6, "Riley James · Sample", "Sample partner company", "Business development", "Chicago", "Illinois", ["Leadership", "Referral partners"]],
].map(([n, name, company, title, city, state, interests]) => ({
  attendee_id: id(3, Number(n) + 100), event_id: e, full_name: String(name), company: String(company), title: String(title), city: String(city), state: String(state),
  bio: "This is an illustrative attendee profile. In the live app, attendees write their own introduction and choose what to share.",
  interests: interests as string[], headshot_path: null, directory_visible: true, messaging_available: true,
}));

export const demoMe: Me = { mode: "demo", authenticated: false, eligible: false, isAdmin: false, attendeeId: null, profile: null, preferences: null };
export const demoConversations: ConversationSummary[] = [
  { id: id(7, 101), peer_id: demoProfiles[0].attendee_id, peer_name: demoProfiles[0].full_name, peer_company: demoProfiles[0].company, peer_headshot_path: null, updated_at: "2026-10-08T15:02:00Z", last_message: "See you by the welcome desk!", last_message_id: 3, last_sender_id: demoProfiles[0].attendee_id, unread_count: 1, blocked_by_me: false, peer_read_id: 2 },
  { id: id(7, 102), peer_id: demoProfiles[2].attendee_id, peer_name: demoProfiles[2].full_name, peer_company: demoProfiles[2].company, peer_headshot_path: null, updated_at: "2026-10-08T14:45:00Z", last_message: "Which workshop are you heading to?", last_message_id: 4, last_sender_id: demoProfiles[2].attendee_id, unread_count: 0, blocked_by_me: false, peer_read_id: 0 },
];
export function demoMessages(conversationId: string): Message[] {
  const conversation = demoConversations.find((c) => c.id === conversationId);
  if (!conversation) return [];
  return [
    { id: 1, event_id: e, conversation_id: conversationId, sender_id: conversation.peer_id, client_id: id(9, 101), body: "Great to connect! Would love to hear what you are working on.", created_at: "2026-10-08T15:00:00Z" },
    { id: 2, event_id: e, conversation_id: conversationId, sender_id: "demo-self", client_id: id(9, 102), body: "Absolutely. Let’s catch up during the networking break.", created_at: "2026-10-08T15:01:00Z" },
    { id: 3, event_id: e, conversation_id: conversationId, sender_id: conversation.peer_id, client_id: id(9, 103), body: "See you by the welcome desk!", created_at: "2026-10-08T15:02:00Z" },
  ];
}
