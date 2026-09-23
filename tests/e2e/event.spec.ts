import { expect, test } from "@playwright/test";

test("public attendee experience is reviewable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome to Momentum Builder LIVE 2026/i })).toBeVisible();
  await expect(page.getByText("DEMO PREVIEW")).toBeVisible();

  await page.getByRole("link", { name: "Agenda" }).first().click();
  await expect(page.getByRole("heading", { name: "Your next move." })).toBeVisible();
  await expect(page.getByText("Sample schedule")).toBeVisible();

  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "Your kind of people." })).toBeVisible();
  await expect(page.getByText(/Sample profiles/)).toBeVisible();
  await expect(page.locator(".person-card")).toHaveCount(6);

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Keep in touch." })).toBeVisible();
  await expect(page.getByText("Sample conversations")).toBeVisible();

  await page.goto("/more");
  await expect(page.getByRole("heading", { name: "Everything else. Right here." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Organizer console/ })).toBeVisible();
});

test("organizer console is useful without implying demo writes", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("DEMO CONSOLE")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set the event in motion." })).toBeVisible();
  await page.goto("/admin/attendees");
  await expect(page.getByRole("heading", { name: "The people coming together." })).toBeVisible();
  await page.getByRole("button", { name: "Import attendees" }).click();
  await expect(page.getByRole("heading", { name: "Bring your attendees in." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview only" })).toBeDisabled();
});

test("mobile shell keeps the event navigation in reach", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(nav).toBeVisible();
  for (const label of ["Home", "Agenda", "People", "Inbox", "More"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("offline cache contains only the public guide contract", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "REFRESH_PUBLIC_GUIDE" });
  });
  await expect.poll(async () => page.evaluate(async () => {
    const cache = await caches.open("event-beast-public-v1");
    return (await cache.match("/api/guide"))?.ok ?? false;
  })).toBe(true);
  const cachedUrls = await page.evaluate(async () => {
    const cache = await caches.open("event-beast-public-v1");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedUrls).toContain("/api/guide");
  expect(cachedUrls.some((path) => path.startsWith("/api/inbox") || path.startsWith("/api/me") || path.startsWith("/api/people") || path.startsWith("/admin"))).toBe(false);

  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: /A little momentum/i })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Offline · Guide saved/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sponsors" })).toBeVisible();
  await context.setOffline(false);
});
