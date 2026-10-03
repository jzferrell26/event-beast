"use client";
import { photoUploadMaxBytes } from './feed';

/** Keep full-resolution camera originals on the device. The server independently
 * decodes the derivative and strips metadata; this is a transport optimization. */
export async function prepareFeedPhoto(file: File): Promise<File> {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type)) {
    throw new Error('Choose a photo, not a video or document. JPG, PNG and WebP work best.');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error('Your browser cannot read this photo. Export it as JPG or choose another photo.'); }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('Choose a smaller photo (under 60 megapixels).');
    const scale = Math.min(1, 1920 / image.naturalWidth, 1920 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preparation is unavailable in this browser. Try another browser.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    canvas.width = 1; canvas.height = 1;
    if (!blob || blob.size > photoUploadMaxBytes) throw new Error('This photo is still too large. Choose a smaller image.');
    return new File([blob], 'event-photo.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(url); }
}
