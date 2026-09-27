import { test, expect } from "@playwright/test";
import { launchCheckDefinitions, type LaunchReadiness } from "../../src/lib/launch-readiness";

test("recorded manual checks cannot hide a closed deployment email gate", async ({ page, request }) => {
  const response = await request.get("/api/admin/launch");
  const report = await response.json() as LaunchReadiness;
  report.content = report.content.map((item) => ({ ...item, status: "ready" }));
  report.contentReady = true;
  report.organizerChecksRecorded = true;
  report.checks = launchCheckDefinitions.map((definition) => ({
    check_key: definition.key, verified: true, notes: "Synthetic browser fixture, not a real live check.",
    verified_at: "2026-09-26T12:00:00Z", verified_by: null, version: 1, updated_at: "2026-09-26T12:00:00Z",
  }));
  report.runtime = report.runtime.map((item) => ({ ...item, status: item.key === "email_gate" ? "needs_attention" : "ready" }));
  report.runtimeReady = false;
  report.eventReady = false;
  await page.route("**/api/admin/launch", (route) => route.fulfill({ json: report }));
  await page.goto("/admin/launch");
  await expect(page.getByText("6 of 6 live checks recorded.", { exact: false })).toBeVisible();
  await expect(page.getByText("4 of 5 deployment checks ready.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your recorded checks are complete." })).toHaveCount(0);
  await expect(page.locator(".launch-runtime-item").filter({ hasText: "Verification and recovery email" })).toContainText("Needs attention");
});

test("organizers can inspect a held source question without publishing it or writing demo decisions", async ({ page, request }) => {
  const response = await request.get("/api/admin/launch");
  const report = await response.json() as LaunchReadiness;
  report.programReview = [{
    session_id: "50000000-0000-4000-8000-000000000001", title: "Synthetic dinner review",
    source_sheet: "Day 2", source_row: 38, issue: "The dinner time and location need organizer confirmation.",
    published: false, review_status: "pending", resolution_notes: "", review_version: 0, reviewed_at: null,
  }];
  await page.route("**/api/admin/launch", (route) => route.fulfill({ json: report }));
  await page.goto("/admin/launch");
  const card = page.locator(".launch-program-card");
  await expect(card).toContainText("Currently unpublished");
  await card.getByRole("button", { name: "Review decision" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Synthetic dinner review" })).toBeVisible();
  await expect(dialog.locator('option[value="confirmed"]')).toHaveJSProperty("disabled", true);
  await dialog.getByRole("combobox", { name: "Organizer decision" }).selectOption("excluded");
  await dialog.getByRole("textbox", { name: "Decision notes", exact: false }).fill("Synthetic preview only; no organizer approval claimed.");
  await expect(dialog.getByRole("button", { name: "Preview only", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Awaiting decision");
});

test("the release metadata endpoint does not expose environment values or private counts", async ({ request }) => {
  const response = await request.get("/api/release");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const release = await response.json();
  expect(Object.keys(release).sort()).toEqual(["application", "emailSignupOpen", "mode", "revision"]);
  expect(release.application).toBe("event-beast");
  expect(release.mode).toBe("demo");
  expect(release.emailSignupOpen).toBe(false);
});
