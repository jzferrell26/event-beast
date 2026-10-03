"use client";
import { photoDerivativeMaxBytes } from './feed';
import { convertHeicPhoto } from './heic-photo';

export async function feedPhotoPreview(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, 320 / bitmap.width, 320 / bitmap.height);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo preview is unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    if (!blob) throw new Error('Photo preview is unavailable.');
    return URL.createObjectURL(blob);
  } finally { bitmap.close(); canvas.width = 1; canvas.height = 1; }
}

export async function isHeicPhoto(file: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  return text.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8));
}
export async function prepareFeedPhoto(file: File, signal?: AbortSignal): Promise<File> {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  const heic = await isHeicPhoto(file);
  if (!heic && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())
    && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('Choose a JPG, JPEG, PNG, WebP or HEIC photo, not a video or document.');
  signal?.throwIfAborted();
  const url = URL.createObjectURL(file), image = new Image();
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
