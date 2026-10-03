import { describe, expect, it, vi } from 'vitest';
import { snapshotFeedPhoto, isHeicPhoto } from '../src/lib/prepare-feed-photo';

describe('temporary phone photo access', () => {
  it('reads the original once without slicing it and keeps a standalone copy', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
    const original = new File([bytes], 'InCollage.jpg', { type: 'image/jpeg', lastModified: 42 });
    const read = vi.spyOn(original, 'arrayBuffer');
    const slice = vi.spyOn(original, 'slice').mockImplementation(() => { throw new Error('Provider does not support reopening a slice'); });
    const copy = await snapshotFeedPhoto(original);
    read.mockRejectedValue(new DOMException('Access revoked', 'NotReadableError'));
    expect(copy).not.toBe(original);
    expect([copy.name, copy.type, copy.lastModified]).toEqual(['InCollage.jpg', 'image/jpeg', 42]);
    expect(new Uint8Array(await copy.arrayBuffer())).toEqual(bytes);
    expect(await isHeicPhoto(copy)).toBe(false);
    expect(read).toHaveBeenCalledTimes(1); expect(slice).not.toHaveBeenCalled();
  });

  it('turns a device permission failure into actionable guidance', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new DOMException('The requested file could not be read', 'NotReadableError'));
    await expect(snapshotFeedPhoto(file)).rejects.toThrow('select it from Files');
  });

  it('rejects incomplete provider reads instead of decoding a partial image', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(1));
    await expect(snapshotFeedPhoto(file)).rejects.toThrow('select it from Files');
  });

  it('checks source bounds before attempting a read', async () => {
    for (const bytes of [0, 25 * 1024 * 1024 + 1]) {
      const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: bytes });
      const read = vi.spyOn(file, 'arrayBuffer');
      await expect(snapshotFeedPhoto(file)).rejects.toThrow('under 25 MB');
      expect(read).not.toHaveBeenCalled();
    }
  });

  it('preserves cancellation before and during the source read', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    const controller = new AbortController(); controller.abort();
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(snapshotFeedPhoto(file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled();
    const duringRead = new AbortController();
    read.mockImplementation(async () => { duringRead.abort(); return new ArrayBuffer(5); });
    await expect(snapshotFeedPhoto(file, duringRead.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
