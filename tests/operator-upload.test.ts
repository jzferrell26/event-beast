import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), requireMember: vi.fn(), requireSponsor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => mocks);
import { POST } from "../src/app/api/uploads/route";
import { ApiError } from "../src/lib/server/http";

const eventId = "10000000-0000-4000-8000-000000000001";
const origin = "http://localhost:3100";
const uploadRequest = (bytes: Uint8Array, type: string) => {
  const form = new FormData();
  form.set("kind", "asset");
  form.set("file", new File([new Uint8Array(bytes)], "operator-image", { type }));
  return new Request(`${origin}/api/uploads`, { method: "POST", headers: { Origin: origin }, body: form });
};

function storageActor() {
  let uploaded: Buffer = Buffer.alloc(0);
  const storage = {
    upload: vi.fn(async (_path: string, bytes: Buffer) => { uploaded = bytes; return { error: null }; }),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array(uploaded)]), error: null })),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/event-assets/${path}` } })),
  };
  const from = vi.fn().mockReturnValue(storage);
  mocks.requireAdmin.mockResolvedValue({ event: { id: eventId }, db: { storage: { from } } });
  return { storage, from, bytes: () => uploaded };
}

describe("operator image route decoding and public asset boundaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["jpeg", "png", "webp"] as const)("re-encodes a %s as verified public organizer WebP", async (format) => {
    const actor = storageActor();
    const bytes = await sharp({ create: { width: 2500, height: 20, channels: 3, background: "white" } }).toFormat(format).toBuffer();
    const response = await POST(uploadRequest(bytes, `image/${format}`));
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.path).toMatch(new RegExp(`^${eventId}/organizer/[a-f0-9-]+\\.webp$`));
    expect(saved.url).toBe(`https://storage.example/event-assets/${saved.path}`);
    expect(actor.from).toHaveBeenCalledWith("event-assets");
    expect(actor.from).not.toHaveBeenCalledWith("event-headshots");
    expect(actor.storage.upload).toHaveBeenCalledWith(saved.path, expect.any(Buffer), { contentType: "image/webp", upsert: false, cacheControl: "3600" });
    const metadata = await sharp(actor.bytes()).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.width).toBe(2400); expect(metadata.exif).toBeUndefined();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.requireSponsor).not.toHaveBeenCalled();
  });

  it("accepts an actual image at exactly 3 MB and rejects one byte over", async () => {
    const actor = storageActor();
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    const padded = Buffer.alloc(3 * 1024 * 1024); png.copy(padded);
    expect((await POST(uploadRequest(padded, "image/png"))).status).toBe(200);
    actor.storage.upload.mockClear();
    expect((await POST(uploadRequest(Buffer.alloc(padded.length + 1), "image/png"))).status).toBe(400);
    expect(actor.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects disguised bytes, unsupported types and empty files before storage", async () => {
    const actor = storageActor();
    for (const [bytes, type] of [[Buffer.from("not a real image"), "image/png"], [Buffer.from("<svg></svg>"), "image/svg+xml"], [Buffer.alloc(0), "image/jpeg"]] as const) {
      expect((await POST(uploadRequest(bytes, type))).status).toBe(400);
    }
    expect(actor.storage.upload).not.toHaveBeenCalled();
    expect(actor.storage.getPublicUrl).not.toHaveBeenCalled();
  });

  it("requires admin authorization including in demo mode", async () => {
    for (const status of [401, 403, 409]) {
      mocks.requireAdmin.mockRejectedValue(new ApiError(status, "Operator upload refused"));
      expect((await POST(uploadRequest(Buffer.from("image"), "image/png"))).status).toBe(status);
    }
  });

  it("never returns a usable URL before storage verification succeeds", async () => {
    const actor = storageActor();
    actor.storage.download.mockResolvedValue({ data: new Blob([]), error: null });
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    const response = await POST(uploadRequest(bytes, "image/png"));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("url");
    expect(actor.storage.getPublicUrl).not.toHaveBeenCalled();
  });
});
