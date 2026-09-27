import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import eventBrand from "../data/event-brand.json";

describe("the organizer's exact logo", () => {
  it("ships the original linked PNG bytes, not a generated replacement", async () => {
    expect(eventBrand.source_url).toBe("https://momentumbuilder.com/wp-content/uploads/2026/05/Momentum-Builder-Live-2026_dark-background-1000.png");
    const bytes = readFileSync(`public${eventBrand.asset_path}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(sha).toBe("cd1d4ad52b9441750f1517f01a34a4a3d4013a83400dd8484337ad1c3d9ad86b");
    expect(sha).toBe(eventBrand.sha256);
    const image = await sharp(bytes).metadata();
    expect(image.format).toBe("png");
    expect([image.width, image.height]).toEqual([1000, 359]);
    expect([eventBrand.width, eventBrand.height]).toEqual([1000, 359]);
  });

  it("uses the same public image in the offline reader and its narrow cache allowlist", () => {
    const html = readFileSync("public/offline.html", "utf8");
    expect(html).toContain(`src="${eventBrand.asset_path}"`);
    expect(html).not.toContain("<span>MB</span>");
    const worker = readFileSync("public/sw.js", "utf8");
    expect(worker).toContain(`"${eventBrand.asset_path}"`);
    expect(worker).not.toContain(eventBrand.source_url);
  });
});
