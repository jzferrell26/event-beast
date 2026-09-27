import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("test-results/review", { recursive: true });
const browser = await chromium.launch();
try {
  const mobile = await browser.newContext({ ...devices["iPhone 13"], browserName: undefined });
  const mobilePage = await mobile.newPage();
  for (const [path, name] of [["/", "mobile-home"], ["/agenda", "mobile-agenda"], ["/people", "mobile-people"], ["/inbox", "mobile-inbox"], ["/admin/launch", "mobile-admin-launch"]]) {
    await mobilePage.goto("http://127.0.0.1:3100" + path, { waitUntil: "networkidle" });
    await mobilePage.screenshot({ path: "test-results/review/" + name + ".png", fullPage: true });
  }
  await mobile.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const desktopPage = await desktop.newPage();
  for (const [path, name] of [["/admin", "desktop-admin"], ["/admin/launch", "desktop-admin-launch"]]) {
    await desktopPage.goto("http://127.0.0.1:3100" + path, { waitUntil: "networkidle" });
    await desktopPage.screenshot({ path: "test-results/review/" + name + ".png", fullPage: true });
  }
  await desktop.close();
} finally {
  await browser.close();
}
console.log("Captured Event Beast review screenshots.");
