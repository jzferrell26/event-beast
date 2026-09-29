import { describe, expect, it } from "vitest";
import { adminImageField, adminImageLabel, adminResources, adminSaveValues, resourceSchema } from "../src/lib/admin-resources";

describe("admin image uploads", () => {
  it("offers a list upload for speakers and sponsors only", () => {
    expect(adminImageField(adminResources.speakers)?.key).toBe("headshot_url");
    expect(adminImageLabel(adminResources.speakers.fields.find((field) => field.key === "headshot_url")!)).toBe("Upload photo");
    expect(adminImageField(adminResources.sponsors)?.key).toBe("logo_url");
    expect(adminImageLabel(adminResources.sponsors.fields.find((field) => field.key === "logo_url")!)).toBe("Upload logo");
    expect(adminImageField(adminResources.venue_locations)).toBeNull();
    expect(adminImageField(adminResources.agenda_sessions)).toBeNull();
  });

  it("saves a speaker photo without clearing the rest of the row", () => {
    const row = { full_name: "Ada Speaker", title: null, bio: "A full biography.", headshot_url: "/speakers/ada.webp", source_url: null, published: true, is_demo: false };
    const values = adminSaveValues(adminResources.speakers, row, { headshot_url: "https://cdn.example/ada.webp" });
    expect(resourceSchema(adminResources.speakers).parse(values)).toMatchObject({
      full_name: "Ada Speaker", title: "", bio: "A full biography.", headshot_url: "https://cdn.example/ada.webp", source_url: "", published: true, is_demo: false,
    });
  });

  it("saves a sponsor logo without clearing booth, tier, or publication", () => {
    const row = { name: "Partner Co", tier_id: null, description: "About the partner.", logo_url: "", booth: "Hall A", cta_label: "Visit", cta_url: "https://partner.example", sort_order: 20, featured: true, published: true, is_demo: false };
    const values = adminSaveValues(adminResources.sponsors, row, { logo_url: "https://cdn.example/logo.webp" });
    expect(resourceSchema(adminResources.sponsors).parse(values)).toMatchObject({
      name: "Partner Co", tier_id: null, booth: "Hall A", logo_url: "https://cdn.example/logo.webp", sort_order: 20, featured: true, published: true,
    });
  });
});
