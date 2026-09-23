/* Standalone public reader. Uses textContent, never untrusted HTML. */
(() => {
  const CACHE = "event-beast-public-v1";
  let guide = null;
  let section = "agenda";
  let selectedDay = null;
  const target = document.getElementById("guide-content");
  const status = document.getElementById("status");
  function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = String(text); if (className) element.className = className; return element; }
  function card(title, body) { const article = node("article"); article.append(node("h2", title)); if (body) article.append(node("p", body)); return article; }
  function empty(text) { target.append(node("p", text, "empty")); }
  function time(iso) { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: guide.event.timezone }).format(new Date(iso)); }
  function location(article, text) { if (text) article.append(node("p", text, "location")); }
  function image(article, url, title) { try { const parsed = new URL(url); if (parsed.protocol !== "https:" || !parsed.pathname.includes(`/storage/v1/object/public/event-assets/${guide.event.id}/`) || parsed.search) return; const image = node("img"); image.src = parsed.href; image.alt = title; image.addEventListener("error", () => image.remove()); article.append(image); } catch {} }
  function render() {
    target.replaceChildren();
    if (!guide) { empty("There is no saved guide on this device yet. Open the app while connected to save the public event essentials."); return; }
    if (guide.event.is_demo || guide.mode === "demo") target.append(node("p", "DEMO · These dates and program details are samples.", "demo"));
    if (section === "agenda") {
      const days = Array.isArray(guide.days) ? guide.days : [];
      if (!selectedDay) selectedDay = days[0]?.id;
      const tabs = node("div", undefined, "day-tabs");
      days.forEach((day) => { const button = node("button", `${day.label} · ${day.date}`); button.type = "button"; button.setAttribute("aria-pressed", String(day.id === selectedDay)); button.addEventListener("click", () => { selectedDay = day.id; render(); }); tabs.append(button); });
      target.append(tabs, node("p", `All times in ${guide.event.timezone}`, "timezone"));
      const sessions = (guide.sessions ?? []).filter((s) => s.day_id === selectedDay);
      if (!sessions.length) empty("No sessions were included for this day in the saved guide.");
      sessions.forEach((session) => { const article = card(session.title, session.description); article.prepend(node("span", `${time(session.starts_at)}–${time(session.ends_at)} · ${session.session_type}`, "eyebrow")); location(article, session.room); target.append(article); });
    } else if (section === "sponsors") {
      const tiers = new Map((guide.tiers ?? []).map((t) => [t.id, t]));
      const sponsors = [...(guide.sponsors ?? [])].sort((a, b) => (tiers.get(a.tier_id)?.sort_order ?? 99999) - (tiers.get(b.tier_id)?.sort_order ?? 99999) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      if (!sponsors.length) empty("No sponsors were included in the saved guide.");
      sponsors.forEach((sponsor) => { const article = card(sponsor.name, sponsor.description); article.prepend(node("span", tiers.get(sponsor.tier_id)?.name ?? "Event partner", "eyebrow")); location(article, sponsor.booth); image(article, sponsor.logo_url, `${sponsor.name} logo`); target.append(article); });
    } else if (section === "lunch") {
      if (!guide.lunches?.length) empty("Lunch details were not included in the saved guide.");
      (guide.lunches ?? []).forEach((lunch) => { const article = card(lunch.title, lunch.description); location(article, [lunch.location, lunch.hours].filter(Boolean).join(" · ")); article.append(node("h3", "Dietary information"), node("p", lunch.dietary_info || "Ask the organizer about dietary needs.")); image(article, lunch.image_url, lunch.title); target.append(article); });
    } else if (section === "venue") {
      if (!guide.venues?.length) empty("Venue details were not included in the saved guide.");
      (guide.venues ?? []).forEach((venue) => { const article = card(venue.title, venue.description); location(article, venue.location); image(article, venue.map_url, `Map for ${venue.title}`); target.append(article); });
      if (guide.settings?.support_location) target.append(card("Need a real person?", guide.settings.support_location));
    } else {
      const now = Date.now();
      const announcements = (guide.announcements ?? []).filter((a) => (!a.starts_at || Date.parse(a.starts_at) <= now) && (!a.expires_at || Date.parse(a.expires_at) > now));
      if (!announcements.length) empty("No current announcements are available in the saved guide.");
      announcements.forEach((a) => { const article = card(a.title, a.body); article.prepend(node("span", a.severity === "urgent" ? "EVENT ALERT" : "EVENT UPDATE", "eyebrow")); target.append(article); });
    }
  }
  async function load() {
    try {
      let response = null;
      if (navigator.onLine) { try { const candidate = await fetch("/api/guide", { credentials: "omit", cache: "no-cache" }); if (candidate.ok && candidate.headers.get("X-Event-Beast-Public") === "guide-v1") response = candidate; } catch {} }
      if (!response && "caches" in window) response = await (await caches.open(CACHE)).match("/api/guide");
      if (response) { const data = await response.json(); if (data.event?.public_guide && data.event?.published && Array.isArray(data.sessions)) guide = data; }
      status.textContent = guide ? `${navigator.onLine ? "Connected · " : "Offline · "}Guide saved ${new Date(guide.fetchedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : "No public guide has been saved on this device yet.";
    } catch { status.textContent = "The saved guide could not be read. Reconnect and open the app to refresh it."; }
    render();
  }
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", () => { section = button.dataset.section; document.querySelectorAll("[data-section]").forEach((tab) => tab.setAttribute("aria-selected", String(tab === button))); render(); }));
  window.addEventListener("online", () => void load());
  window.addEventListener("offline", () => void load());
  void load();
})();
