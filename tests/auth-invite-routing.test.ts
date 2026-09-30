import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/format';

describe('invite and recovery routing', () => {
  it('keeps reset destinations local', () => {
    expect(safeNext('/reset-password')).toBe('/reset-password');
    expect(safeNext('//evil.example')).toBe('/');
  });
  it('allows the post-password access handoff route', () => {
    expect(safeNext('/access')).toBe('/access');
  });
});
