import type { AgendaSession, Announcement, Guide } from "./types";

export function initials(name: string): string {
  return name.replace(/·.*$/, "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "MB";
}
export function eventTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}
export function eventDay(date: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));
}
export function sessionState(session: AgendaSession, now: number): "now" | "upcoming" | "ended" {
  if (now < Date.parse(session.starts_at)) return "upcoming";
  return now < Date.parse(session.ends_at) ? "now" : "ended";
}
export function activeAnnouncements(announcements: Announcement[], now: number): Announcement[] {
  return announcements.filter((a) => a.published && (!a.starts_at || Date.parse(a.starts_at) <= now) && (!a.expires_at || Date.parse(a.expires_at) > now));
}
export function sessionSpeakers(guide: Guide, sessionId: string) {
  const linked = new Set(guide.sessionSpeakers.filter((link) => link.session_id === sessionId).map((link) => link.speaker_id));
  return guide.speakers.filter((speaker) => linked.has(speaker.id));
}
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  return /^\/(?:agenda(?:\/[a-f0-9-]{36})?|people(?:\/[a-f0-9-]{36})?|inbox(?:\/[a-f0-9-]{36})?|more(?:\/[a-z-]+)?|admin(?:\/[a-z_]+)?|reset-password)?$/.test(next) ? next : "/";
}
export function httpsUrl(value: string | null | undefined): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
