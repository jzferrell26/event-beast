import { describe, expect, it } from "vitest";
import { adminImageField, adminImageLabel, adminImagePatchSchema, adminImageUploadError, adminResources, adminSaveValues, resourceSchema, sessionSpeakerIdsSchema } from "../src/lib/admin-resources";

describe("admin image uploads", () => {
  it("validates every accepted format and the exact 3 MB boundary before upload", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(adminImageUploadError({ type, size: 3 * 1024 * 1024 })).toBeNull();
      expect(adminImageUploadError({ type, size: 3 * 1024 * 1024 + 1 })).toMatch(/3 MB/);
      expect(adminImageUploadError({ type, size: 0 })).toBeTruthy();
    }
    expect(adminImageUploadError({ type: "image/svg+xml", size: 100 })).toBeTruthy();
    expect(adminImageUploadError({ type: "application/pdf", size: 100 })).toBeTruthy();
  });

  it("limits immediate saves to an id and HTTPS image URL, not stale content or forged scope", () => {
    const payload = { id: "10000000-0000-4000-8000-000000000001", url: "https://cdn.example/new.webp" };
    expect(adminImagePatchSchema.parse(payload)).toEqual(payload);
    for (const extra of [{ bio: "Older biography" }, { published: true }, { event_id: payload.id }, { values: {} }]) {
      expect(adminImagePatchSchema.safeParse({ ...payload, ...extra }).success).toBe(false);
    }
    for (const url of ["", "/image.webp", "http://cdn.example/image.webp", "javascript:alert(1)"]) {
      expect(adminImagePatchSchema.safeParse({ ...payload, url }).success).toBe(false);
    }
  });

  it("deduplicates session speakers and refuses invalid or oversized selections", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    expect(sessionSpeakerIdsSchema.parse([id, id])).toEqual([id]);
    expect(sessionSpeakerIdsSchema.parse([])).toEqual([]);
    expect(sessionSpeakerIdsSchema.safeParse(["someone"]).success).toBe(false);
    expect(sessionSpeakerIdsSchema.safeParse(Array(101).fill(id)).success).toBe(false);
  });
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
