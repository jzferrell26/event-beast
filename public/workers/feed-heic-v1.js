/* global importScripts */
// Only loaded when a selected HEIC cannot be decoded natively. No network upload.
self.onmessage = async event => {
  let images = [];
  try {
    const file = event.data;
    if (!(file instanceof Blob) || !file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
    importScripts('/vendor/libheif-1.23.2/decoder.js');
    const codec = await self.libheif();
    const decoder = new codec.HeifDecoder();
    images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
    const image = images.find(item => item.is_primary()) || images[0];
    if (!image) throw new Error('This HEIC file could not be decoded.');
    const width = image.get_width(), height = image.get_height();
    if (!width || !height || width * height > 24_000_000) throw new Error('Choose a HEIC photo under 24 megapixels, or use your camera’s standard photo mode.');
    const data = await new Promise((resolve, reject) => {
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, result => result ? resolve(result) : reject(new Error('This HEIC file could not be decoded.')));
    });
    if (typeof OffscreenCanvas === 'undefined') {
      // Some WebKit builds have workers but no OffscreenCanvas. Transfer, don't
      // copy, the decoded raster; the main thread only performs canvas encoding.
      self.postMessage({ pixels: data.data.buffer, width, height }, [data.data.buffer]);
      return;
    }
    const original = new OffscreenCanvas(width, height), originalContext = original.getContext('2d');
    originalContext.putImageData(new ImageData(data.data, width, height), 0, 0);
    const scale = Math.min(1, 1920 / width, 1920 / height);
    const small = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const context = small.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, small.width, small.height);
    context.drawImage(original, 0, 0, small.width, small.height);
    original.width = 1; original.height = 1;
    let blob;
    for (const quality of [0.82, 0.68, 0.5]) {
      blob = await small.convertToBlob({ type: 'image/jpeg', quality });
      if (blob.size <= 1024 * 1024) break;
    }
    if (!blob || blob.size > 1024 * 1024) throw new Error('Choose a smaller photo.');
    small.width = 1; small.height = 1;
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'This HEIC file could not be decoded.' });
  } finally {
    for (const image of images) image.free();
    self.close();
  }
};
