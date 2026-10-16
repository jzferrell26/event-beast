import 'server-only';
import { ApiError } from '../http';

export async function readWebhookBody(request: Request, maxBytes = 1048576): Promise<string> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiError(413, 'Notification too large.');
  if (!request.body) throw new ApiError(400, 'Notification body required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new ApiError(413, 'Notification too large.'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
