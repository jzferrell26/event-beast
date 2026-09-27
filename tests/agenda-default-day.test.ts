import { describe, expect, it } from "vitest";
import { currentAgendaDay, eventZoneLabel } from "../src/lib/format";
import { demoGuide } from "../src/lib/demo";

describe("event-aware agenda day selection", () => {
  it("opens the current event day rather than always showing day one", () => {
    expect(currentAgendaDay(demoGuide.days, Date.parse("2026-10-09T15:00:00Z"), "America/Chicago")?.id).toBe(demoGuide.days[1].id);
  });
  it("respects the event date near UTC midnight", () => {
    expect(currentAgendaDay(demoGuide.days, Date.parse("2026-10-09T02:00:00Z"), "America/Chicago")?.id).toBe(demoGuide.days[0].id);
  });
  it("selects the next event day before the event and the last day afterward", () => {
    expect(currentAgendaDay(demoGuide.days, Date.parse("2026-09-23T12:00:00Z"), "America/Chicago")?.id).toBe(demoGuide.days[0].id);
    expect(currentAgendaDay(demoGuide.days, Date.parse("2026-10-11T12:00:00Z"), "America/Chicago")?.id).toBe(demoGuide.days[1].id);
    expect(currentAgendaDay([], Date.now(), "America/Chicago")).toBeUndefined();
  });
  it("shows attendees a readable timezone name", () => {
    expect(eventZoneLabel("America/Chicago")).toBe("Central Time");
  });
});
