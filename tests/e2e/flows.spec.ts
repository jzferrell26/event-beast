import { test, expect } from "@playwright/test";

test("agenda day switching, search and saved sessions survive reload", async ({ page }) => {
  await page.goto("/agenda");
  await page.getByRole("tab", { name: /Day 02/ }).click();
  await expect(page.locator(".session-card")).toHaveCount(4);
  await page.getByRole("tab", { name: /Day 01/ }).click();
  await expect(page.locator(".session-card")).toHaveCount(6);
  await expect(page.locator(".agenda-ad")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search sessions" }).fill("systems that scale");
  await expect(page.locator(".session-card")).toHaveCount(1);
  await expect(page.locator(".agenda-ad")).toHaveCount(0);
  await page.getByRole("button", { name: "Save From busy to built: systems that scale", exact: true }).click();
  await page.goto("/more/saved");
  await expect(page.locator(".session-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".session-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Unsave From busy to built: systems that scale", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make room for your favorites." })).toBeVisible();
});

test("attendee discovery supports interests, name search and saved contacts", async ({ page }) => {
  await page.goto("/people");
  await expect(page.locator(".person-card")).toHaveCount(6);
  await page.getByRole("button", { name: "AI & automation", exact: true }).click();
  await expect(page.locator(".person-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search attendees" }).fill("Jordan");
  await expect(page.locator(".person-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Save Jordan Lee · Sample", exact: true }).click();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByRole("button", { name: "Everyone", exact: true }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator(".person-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Jordan Lee · Sample", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jordan Lee · Sample", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a conversation" })).toBeVisible();
  await expect(page.getByRole("link", { name: /@example/ })).toHaveCount(0);
});

test("CSV preview distinguishes valid records from duplicate registrations", async ({ page }) => {
  await page.goto("/admin/attendees");
  await page.getByRole("button", { name: "Import attendees", exact: true }).click();
  const file = page.getByRole("dialog").locator('input[type="file"]');
  await file.setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from("email,name\nalpha@example.test,Alpha Sample\nbeta@example.test,Beta Sample") });
  await expect(page.getByRole("heading", { name: "2 registrations ready to import" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview only", exact: true })).toBeDisabled();
  await file.setInputFiles({ name: "duplicate.csv", mimeType: "text/csv", buffer: Buffer.from("email,name\nalpha@example.test,Alpha Sample\nALPHA@example.test,Duplicate Sample") });
  await expect(page.getByText("Duplicate email in this file", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview only", exact: true })).toBeDisabled();
});

test("launch center identifies sample content and never invents completed live tests", async ({ page }) => {
  await page.goto("/admin/launch");
  await expect(page.getByRole("heading", { name: "Ready for the room." })).toBeVisible();
  await expect(page.getByText("0 of 6 live checks recorded.", { exact: false })).toBeVisible();
  await expect(page.locator(".launch-content-item")).toHaveCount(8);
  await expect(page.locator(".launch-content-item").first()).toContainText("Needs attention");
  await expect(page.getByText("Awaiting verification", { exact: true })).toHaveCount(6);
  await page.getByRole("button", { name: "Record verification", exact: false }).first().click();
  await page.getByRole("checkbox").check();
  await page.getByRole("textbox", { name: "Verification notes", exact: false }).fill("Demo form exploration, not a real hosted check.");
  await expect(page.getByRole("button", { name: "Preview only", exact: false })).toBeDisabled();
});

test("onboarding can be explored, dismissed and opened from help", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Make this event yours/ }).click();
  await expect(page.getByRole("heading", { name: "Start with you." })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Choose how you show up." })).toBeVisible();
  await page.getByRole("button", { name: "Maybe later", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/more/help");
  await page.getByRole("button", { name: /Take the app walkthrough/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("direct demo mutations are refused and private API responses are not public-cacheable", async ({ request }) => {
  const response = await request.post("/api/inbox", {
    headers: { Origin: "http://127.0.0.1:3100" }, data: { recipient: "30000000-0000-4000-8000-000000000101" },
  });
  expect(response.status()).toBe(409);
  const forged = await request.post("/api/admin/import", {
    headers: { Origin: "https://unrelated.example" }, data: { csv: "email,name\na@example.test,A", commit: true },
  });
  expect(forged.status()).toBe(403);
  for (const path of ["/api/me", "/api/people", "/api/inbox", "/api/admin/launch"]) {
    const result = await request.get(path);
    expect(result.status()).toBe(200);
    expect(result.headers()["cache-control"]).toContain("no-store");
  }
  const guide = await request.get("/api/guide");
  expect(guide.headers()["x-event-beast-public"]).toBe("guide-v1");
  const serialized = JSON.stringify(await guide.json());
  expect(serialized).not.toContain("registration_email");
  expect(serialized).not.toContain("conversation_id");
});

test("phone layouts fit the viewport and essential controls stay usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  for (const route of ["/", "/agenda", "/people", "/inbox", "/more", "/more/profile", "/admin/launch"]) {
    await page.goto(route);
    await page.locator("h1").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const widths = await page.evaluate(() => ({ available: window.innerWidth, content: document.documentElement.scrollWidth }));
    expect(widths.content, `${route} overflows horizontally`).toBeLessThanOrEqual(widths.available + 1);
    if (!route.startsWith("/admin")) {
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      const box = await nav.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(60);
      await expect(nav).toBeVisible();
    }
  }
});
