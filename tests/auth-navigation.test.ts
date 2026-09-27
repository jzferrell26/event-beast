import { describe, expect, it } from 'vitest';
import { authenticationOrigin } from '../src/lib/auth-navigation';
import { safeNext } from '../src/lib/format';

describe('same-origin authentication redirects', () => {
  it('uses the configured website, independent of an internal proxy hostname', () => {
    const destination = new URL(safeNext('/more/profile'), authenticationOrigin('https://event-beast.vercel.app/'));
    expect(destination.href).toBe('https://event-beast.vercel.app/more/profile');
  });
  it('preserves the exact local test host so confirmation cookies stay available', () => {
    expect(authenticationOrigin('http://127.0.0.1:3101')).toBe('http://127.0.0.1:3101');
    expect(authenticationOrigin('http://localhost:3100')).toBe('http://localhost:3100');
  });
  it('refuses missing, credential-bearing and insecure external origins', () => {
    for (const value of [undefined, '/relative', 'http://untrusted.example', 'https://user:secret@example.test', 'javascript:alert(1)']) {
      expect(() => authenticationOrigin(value)).toThrow();
    }
  });
  it('never uses an external next parameter as a redirect destination', () => {
    expect(new URL(safeNext('//evil.example'), authenticationOrigin('https://event-beast.vercel.app')).href).toBe('https://event-beast.vercel.app/');
  });
});
