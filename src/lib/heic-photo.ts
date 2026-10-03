"use client";
async function encodePixels(pixels: ArrayBuffer, width: number, height: number): Promise<Blob> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 24_000_000 || pixels.byteLength !== width * height * 4) throw new Error('Invalid photo dimensions.');
  const original = document.createElement('canvas'), small = document.createElement('canvas');
  try {
    original.width = width; original.height = height;
    const originalContext = original.getContext('2d');
    if (!originalContext) throw new Error('Photo preparation is unavailable.');
    originalContext.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    const scale = Math.min(1, 1920 / width, 1920 / height);
    small.width = Math.max(1, Math.round(width * scale)); small.height = Math.max(1, Math.round(height * scale));
    const context = small.getContext('2d');
    if (!context) throw new Error('Photo preparation is unavailable.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, small.width, small.height); context.drawImage(original, 0, 0, small.width, small.height);
    original.width = 1; original.height = 1;
    for (const quality of [0.82, 0.68, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => small.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 1024 * 1024) return blob;
    }
    throw new Error('Choose a smaller photo.');
  } finally { original.width = 1; original.height = 1; small.width = 1; small.height = 1; }
}
/** One disposable worker per sequential conversion. Termination releases codec
 * memory on success, timeout, cancel and navigation; nothing is sent off-device. */
export function convertHeicPhoto(file: File, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Canceled', 'AbortError')); return; }
    let worker: Worker;
    try { worker = new Worker('/workers/feed-heic-v1.js'); }
    catch { reject(new Error('HEIC conversion is unavailable. Choose a JPG photo in this browser.')); return; }
    let settled = false;
    const finish = (error?: Error, blob?: Blob) => {
      if (settled) return; settled = true;
      window.clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate();
      if (error) reject(error); else if (blob) resolve(blob);
    };
    const cancel = () => finish(new DOMException('Canceled', 'AbortError'));
    const timer = window.setTimeout(() => finish(new Error('Photo preparation timed out. Try a smaller photo or standard camera mode.')), 30000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = event => {
      if (event.data?.blob instanceof Blob) finish(undefined, event.data.blob);
      else if (event.data?.pixels instanceof ArrayBuffer) {
        worker.terminate();
        void encodePixels(event.data.pixels, event.data.width, event.data.height).then(blob => finish(undefined, blob), error => finish(error));
      }
      else finish(new Error(event.data?.error || 'This HEIC file could not be decoded.'));
    };
    worker.onerror = () => finish(new Error('Photo preparation stopped. Try a smaller photo or a JPG.'));
    worker.postMessage(file);
  });
}
