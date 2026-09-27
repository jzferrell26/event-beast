"use client";

// Retry only explicit throttling: a dropped signup response may already have
// sent an email. Never automatically replay an uncertain email operation.
export async function authRequest<T>(body: unknown, onWaiting: (seconds: number) => void, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 7; attempt++) {
    signal?.throwIfAborted();
    let response: Response;
    try {
      const timeout = AbortSignal.timeout(45000);
      response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('The connection was interrupted. Check your inbox before requesting another verification email, or try signing in again.');
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok) { onWaiting(0); return data as T; }
    if (response.status !== 429 || attempt === 6) throw new Error(data.error || 'We could not complete that request. Please try again.');
    const seconds = Math.min(20, Number(response.headers.get('retry-after')) || 3 * (attempt + 1)) + Math.random() * 3;
    onWaiting(Math.ceil(seconds));
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, seconds * 1000);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  throw new Error('Sign-in is busy. Please try again in a moment.');
}
