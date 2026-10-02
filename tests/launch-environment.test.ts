import { describe, expect, it } from "vitest";
import { evaluateEnvironment, EVENT_BEAST_PROJECT_REF, type LaunchEnvironment } from "../src/lib/launch-environment";
import { evaluateProgramReview, type ProgramReview } from "../src/lib/launch-readiness";
import { demoGuide } from "../src/lib/demo";

const ready: LaunchEnvironment = {
  demo: false, backendUrl: `https://${EVENT_BEAST_PROJECT_REF}.supabase.co`,
  backendKeyConfigured: true, siteUrl: "https://event-beast.vercel.app",
  emailReady: true, recoveryReady: true, activeAdmins: 1,
};

describe("deployment launch checks", () => {
  it("recognizes configured settings without claiming delivery was tested", () => {
    const report = evaluateEnvironment(ready);
    expect(report.every((item) => item.status === "ready")).toBe(true);
    expect(report.find((item) => item.key === "email_gate")?.detail).toContain("must still be recorded");
  });
  it.each([
    ["live_mode", { demo: true }],
    ["dedicated_backend", { backendUrl: "https://another-application.supabase.co" }],
    ["dedicated_backend", { backendKeyConfigured: false }],
    ["secure_origin", { siteUrl: "http://event-beast.vercel.app" }],
    ["secure_origin", { siteUrl: "https://user:password@example.test" }],
    ["secure_origin", { siteUrl: "not a URL" }],
    ["email_gate", { emailReady: false }],
    ["recovery_email", { recoveryReady: false }],
    ["active_admin", { activeAdmins: 0 }],
  ] as const)("fails closed for %s", (key, override) => {
    expect(evaluateEnvironment({ ...ready, ...override }).find((item) => item.key === key)?.status).toBe("needs_attention");
  });
});

describe("imported program launch checks", () => {
  const review: ProgramReview = {
    session_id: demoGuide.sessions[0].id, title: "Working session", published: false,
    source_sheet: "Day 2", source_row: 12, issue: "Times conflict",
    review_status: "pending", resolution_notes: "", review_version: 0, reviewed_at: null,
  };
  it("requires a decision even after an unresolved session is published", () => {
    const report = evaluateProgramReview(demoGuide, [{ ...review, published: true }]);
    expect(report.find((item) => item.key === "program_review")?.status).toBe("needs_attention");
  });
  it("accepts an explicit exclusion without publishing an uncertain session", () => {
    const report = evaluateProgramReview(demoGuide, [{ ...review, review_status: "excluded", resolution_notes: "Organizer removed the session" }]);
    expect(report.find((item) => item.key === "program_review")?.status).toBe("ready");
  });
  it("reports missing speaker assets and a missing map instead of inventing them", () => {
    const guide = structuredClone(demoGuide);
    guide.speakers[0].headshot_url = "";
    guide.venues.forEach((venue) => { venue.map_url = ""; });
    const report = evaluateProgramReview(guide, []);
    expect(report.find((item) => item.key === "speaker_assets")?.status).toBe("needs_attention");
    expect(report.find((item) => item.key === "venue_map")?.status).toBe("needs_attention");
  });
});
