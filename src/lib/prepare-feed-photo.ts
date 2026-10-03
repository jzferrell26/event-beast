"use client";
import { photoDerivativeMaxBytes } from './feed';
import { convertHeicPhoto } from './heic-photo';

const photoReadError = 'We could not read this photo from your device. Choose it again; if it still fails, save a copy to your device and select it from Files.';

/** Read the entire original once while the picker still owns its permission.
 * Sniffing a slice or decoding its object URL must not re-open a temporary
 * Android content-provider handle. All later work uses this in-memory copy. */
export async function snapshotFeedPhoto(file: File, signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted();
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); }
  catch {
    signal?.throwIfAborted();
    throw new Error(photoReadError);
  }
  signal?.throwIfAborted();
  if (bytes.byteLength !== file.size) throw new Error(photoReadError);
  return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
}

/** Keep full-resolution camera originals on the device. The server independently
 * decodes the derivative and strips metadata; this is a transport optimization. */
export async function isHeicPhoto(file: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  return text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8));
}
export async function prepareFeedPhoto(file: File, signal?: AbortSignal): Promise<File> {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  const declaredHeic = ['image/heic', 'image/heif'].includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
  // Samsung/Android gallery providers can expose a usable JPEG to an object URL
  // while rejecting Blob.arrayBuffer(). Do not byte-read ordinary browser-
  // decodable photos. Keep the picker alive until decode/canvas work finishes.
  let heic = declaredHeic;
  if (declaredHeic) file = await snapshotFeedPhoto(file, signal);
  else if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    file = await snapshotFeedPhoto(file, signal);
    heic = await isHeicPhoto(file);
  }
  if (!heic && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())
    && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('Choose a JPG, JPEG, PNG, WebP or HEIC photo, not a video or document.');
  signal?.throwIfAborted();
  const url = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    image.src = url;
    try { await image.decode(); }
    catch {
      if (heic) {
        const converted = await convertHeicPhoto(file, signal);
        return new File([converted], 'event-photo.jpg', { type: 'image/jpeg' });
      }
      throw new Error('This photo could not be read. Try selecting it from your photo library, or choose another photo.');
    }
    signal?.throwIfAborted();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('Choose a smaller photo (under 60 megapixels).');
    canvas = document.createElement('canvas');
    for (const edge of [1920, 1440, 1080]) {
      const scale = Math.min(1, edge / image.naturalWidth, edge / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo preparation is unavailable in this browser.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, 'image/jpeg', 0.8));
      signal?.throwIfAborted();
      if (blob && blob.size <= photoDerivativeMaxBytes) return new File([blob], 'event-photo.jpg', { type: 'image/jpeg' });
    }
    throw new Error('This photo is still too large. Choose a smaller image.');
  } finally {
    image.src = ''; URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
