import { randomUUID } from "node:crypto";
import { requireAdmin, requireMember } from "@/lib/server/auth";
import { ApiError, assertSameOrigin, handle, json } from "@/lib/server/http";

export const POST = (request: Request) => handle(async () => {
  assertSameOrigin(request);
  // Vercel route bodies have a lower limit than the storage bucket. Direct signed
  // uploads can be added later; this confirmed server path accepts up to 3 MB.
  if (Number(request.headers.get("content-length") ?? 0) > 3.5 * 1024 * 1024) throw new ApiError(413, "Choose a JPG, PNG or WebP under 3 MB.");
  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "asset" ? "asset" : "headshot";
  const actor = kind === "asset" ? await requireAdmin() : await requireMember();
  if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new ApiError(400, "Choose a JPG, PNG or WebP under 3 MB.");
  }
  // Decode and re-encode to strip metadata and reject disguised/non-image bytes.
  const sharp = (await import("sharp")).default;
  let bytes: Buffer;
  try { bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 }).rotate().resize({ width: kind === "headshot" ? 640 : 2400, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer(); }
  catch { throw new ApiError(400, "This image could not be read. Please try a different JPG, PNG or WebP."); }
  const bucket = kind === "asset" ? "event-assets" : "event-headshots";
  const owner = kind === "asset" ? "organizer" : actor.attendee?.id;
  const path = `${actor.event.id}/${owner}/${randomUUID()}.webp`;
  const upload = await actor.db.storage.from(bucket).upload(path, bytes, { contentType: "image/webp", upsert: false, cacheControl: kind === "asset" ? "3600" : "0" });
  if (upload.error) throw new ApiError(503, "The image upload did not complete. Please try again.");
  const verified = await actor.db.storage.from(bucket).download(path);
  if (verified.error || verified.data.size !== bytes.byteLength) throw new ApiError(503, "The uploaded image could not be verified. Please try again.");
  const url = kind === "asset" ? actor.db.storage.from(bucket).getPublicUrl(path).data.publicUrl
    : (await actor.db.storage.from(bucket).createSignedUrl(path, 120)).data?.signedUrl;
  if (!url) throw new ApiError(503, "The image was uploaded, but its preview is not available yet. Please try again.");
  return json({ path, url });
});
