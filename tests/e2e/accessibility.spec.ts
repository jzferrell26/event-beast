import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const route of ["/", "/agenda", "/people", "/inbox", "/more/help", "/admin", "/admin/launch", "/auth", "/admin/users", "/sponsor", "/sponsor/60000000-0000-4000-8000-000000000002"]) {
  test(`accessible content and controls: ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.locator("h1").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    // Wait for initial app resource requests and skeletons to settle.
    await expect(page.getByRole("status", { name: "Loading", exact: true })).toHaveCount(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const violations = results.violations.map((violation) => ({
      id: violation.id, impact: violation.impact,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
    expect(violations).toEqual([]);
  });
}
