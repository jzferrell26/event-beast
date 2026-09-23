import { test, expect } from "@playwright/test";
import { demoGuide } from "../../src/lib/demo";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100").origin;
const sponsor = demoGuide.sponsors[1];

test("Sponsor workspace shows only the assigned page and previews content edits", async ({ page }) => {
  await page.goto("/sponsor");
  await expect(page.getByRole("heading", { name: "Make a great introduction." })).toBeVisible();
  await expect(page.locator(".sponsor-workspace-card")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Organizer navigation" })).toHaveCount(0);
  await page.getByRole("link", { name: "Edit your sponsor page" }).click();
  await expect(page.getByRole("heading", { name: "Put your best page forward." })).toBeVisible();
  await page.getByRole("textbox", { name: "Sponsor name", exact: true }).fill("Our sample sponsor team");
  await expect(page.locator(".sponsor-preview-copy h2")).toHaveText("Our sample sponsor team");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview save", exact: true }).click();
  await expect(page.getByText("This is a sponsor preview. No page content has been published.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Sponsor name", exact: true })).toHaveValue(sponsor.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("Admin can configure all three roles and scope a sponsor to selected pages", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "The right access for everyone." })).toBeVisible();
  await expect(page.locator(".role-overview-card")).toHaveCount(3);
  await expect(page.locator(".user-access-row")).toHaveCount(6);
  await page.getByRole("button", { name: "Edit access for Jordan Lee · Sample" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox", { name: "Role", exact: true })).toHaveValue("sponsor");
  await expect(dialog.getByRole("checkbox", { name: sponsor.name, exact: true })).toBeChecked();
  await dialog.getByRole("combobox", { name: "Role", exact: true }).selectOption("member");
  await expect(dialog.getByRole("group", { name: "Pages this sponsor can edit" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Role", exact: true }).selectOption("admin");
  await expect(dialog.getByText("Full control of event content, sponsors, settings, users and permissions.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Preview permissions" }).click();
  await expect(dialog.getByRole("alert")).toContainText("read-only");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add user", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Role", exact: true })).toHaveValue("member");
});

test("Direct sponsor and role requests preserve authorization boundaries", async ({ request }) => {
  const own = await request.get(`/api/sponsor/${sponsor.id}`);
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toContain("no-store");
  expect((await request.get(`/api/sponsor/${demoGuide.sponsors[0].id}`)).status()).toBe(403);
  const fields = { name: sponsor.name, description: sponsor.description, logo_url: "", booth: sponsor.booth, cta_label: "Meet us", cta_url: "" };
  const forged = await request.patch(`/api/sponsor/${sponsor.id}`, { headers: { Origin: origin }, data: { expected_version: 0, values: { ...fields, tier_id: demoGuide.tiers[0].id } } });
  expect(forged.status()).toBe(400);
  expect((await request.patch(`/api/sponsor/${sponsor.id}`, { headers: { Origin: origin }, data: { expected_version: 0, values: fields } })).status()).toBe(409);
  expect((await request.post("/api/admin/users", { headers: { Origin: origin }, data: { id: null, expected_version: null, registration_name: "Demo user", registration_email: "demo@example.test", role: "admin", status: "approved", directory_allowed: false, sponsor_ids: [] } })).status()).toBe(409);
  expect((await request.get("/api/admin/users")).headers()["cache-control"]).toContain("no-store");
});
