import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const eventBrand: { asset_path: string; sha256: string } = JSON.parse(readFileSync(new URL("../../data/event-brand.json", import.meta.url), "utf8"));

test("the official logo replaces the placeholder in every shared app header", async ({ page, request }, testInfo) => {
  test.setTimeout(60000);
  const asset = await request.get(eventBrand.asset_path);
  expect(asset.status()).toBe(200);
  expect(createHash("sha256").update(await asset.body()).digest("hex")).toBe(eventBrand.sha256);
  for (const route of ["/", "/inbox", "/join", "/auth", "/admin", "/sponsor"]) {
    await page.goto(route);
    const brand = page.locator("a.brand-official:visible");
    await expect(brand).toHaveCount(1);
    await expect(brand).toHaveAttribute("href", "/");
    await expect(brand).toHaveAccessibleName("Momentum Builder home");
    const image = brand.getByRole("img", { name: "Momentum Builder LIVE 2026", exact: true });
    await expect(image).toHaveAttribute("src", eventBrand.asset_path);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1000 && img.naturalHeight === 359)).toBe(true);
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(image).toHaveCSS("filter", "none");
    await expect(image).toHaveCSS("transform", "none");
    const bounds = (await image.boundingBox())!;
    expect(bounds.width / bounds.height, route).toBeCloseTo(1000 / 359, 1);
    expect(bounds.width, route).toBeGreaterThan(100);
    expect(bounds.x, route).toBeGreaterThanOrEqual(0);
    expect(bounds.y, route).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width, route).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await expect(page.locator(".brand-mark,.brand-type")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
    if (["/", "/join", "/admin"].includes(route)) await page.screenshot({ path: testInfo.outputPath(`${route === "/" ? "home" : route.slice(1)}-official-logo.png`) });
  }
  await page.goto("/agenda");
  await page.locator("a.brand-official:visible").click();
  await expect(page).toHaveURL(/\/$/);
});

test("the original logo remains available in the offline public guide", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async (assetPath) => Boolean(await (await caches.open("event-beast-public-v1")).match(assetPath)), eventBrand.asset_path)).toBe(true);
  await page.goto("/offline.html");
  await context.setOffline(true);
  await page.reload();
  const logo = page.getByRole("img", { name: "Momentum Builder LIVE 2026", exact: true });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1000)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await context.setOffline(false);
});

test("the logo and header controls fit a narrow phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const route of ["/", "/join", "/admin", "/sponsor"]) {
    await page.goto(route);
    await expect(page.locator("a.brand-official:visible")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
    const bounds = (await page.locator("a.brand-official:visible").boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    if (route === "/") {
      const actions = (await page.locator(".topbar-actions").boundingBox())!;
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(actions.x);
    }
  }
});
