import 'server-only';
import { ApiError } from './http';

/** Per-process memory/CPU guard, not a claim about global platform capacity. */
export function createPhotoWorkLimit(concurrency = 2, maxWaiting = 8) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      if (waiting.length >= maxWaiting) throw new ApiError(503, 'Photo processing is busy. Please retry in a moment.');
      await new Promise<void>(resolve => waiting.push(resolve));
    } else active++;
    try { return await work(); }
    finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  };
}
export const runPhotoWork = createPhotoWorkLimit();
// Admit only bounded upload streams BEFORE buffering multipart bodies. Separate
// from codec work to avoid nesting the same semaphore and deadlocking.
export const runPhotoUpload = createPhotoWorkLimit();

// Immutable derivatives only. Every caller MUST authorize the post first.
// This avoids repeated expensive decoding; no private browser/CDN cache is used.
const cache = new Map<string, { bytes: Buffer; until: number }>();
const inflight = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
const maxBytes = 16 * 1024 * 1024;
export async function cachedFeedPhoto(path: string, load: () => Promise<Buffer>): Promise<Buffer> {
  const prior = cache.get(path);
  if (prior && prior.until > Date.now()) return prior.bytes;
  if (prior) { cache.delete(path); cacheBytes -= prior.bytes.length; }
  const pending = inflight.get(path);
  if (pending) return pending;
  if (inflight.size >= 10) throw new ApiError(503, 'Photos are loading. Please retry in a moment.');
  const task = (async () => {
    const bytes = await load();
    while (cache.size && (cacheBytes + bytes.length > maxBytes || cache.size >= 32)) {
      const key = cache.keys().next().value!;
      cacheBytes -= cache.get(key)!.bytes.length; cache.delete(key);
    }
    if (bytes.length <= maxBytes) { cache.set(path, { bytes, until: Date.now() + 60000 }); cacheBytes += bytes.length; }
    return bytes;
  })();
  inflight.set(path, task);
  try { return await task; } finally { inflight.delete(path); }
}
