import { describe, expect, it } from "vitest";
import { releaseInfo } from "../src/lib/release-info";

describe("public release provenance", () => {
  it("reports only the release revision, mode and email gate", () => {
    expect(releaseInfo({ revision: "a".repeat(40), demo: false, emailReady: false })).toEqual({
      application: "event-beast", revision: "a".repeat(40), mode: "live", emailSignupOpen: false,
    });
  });
  it("does not mistake an unknown revision for a verified deployment", () => {
    expect(releaseInfo({ demo: false, emailReady: true }).revision).toBeNull();
    expect(releaseInfo({ revision: "not-a-commit-or-a-secret", demo: false, emailReady: true }).revision).toBeNull();
  });
  it("never advertises open signup in demo mode", () => {
    expect(releaseInfo({ revision: "b".repeat(40), demo: true, emailReady: true }).emailSignupOpen).toBe(false);
  });
});
