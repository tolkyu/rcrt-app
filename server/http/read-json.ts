import { PayloadTooLargeError, ValidationError } from './errors';

export const MAX_JSON_BODY_BYTES = 1_048_576;

/** Count streamed bytes as Content-Length can be missing or false (DG-10). */
export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_JSON_BODY_BYTES
  ) {
    await request.body?.cancel().catch(() => undefined);
    throw new PayloadTooLargeError();
  }
  if (!request.body) return undefined;

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof PayloadTooLargeError) throw error;
    throw new ValidationError([{ path: 'body', code: 'invalid_json' }]);
  } finally {
    reader.releaseLock();
  }
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError([{ path: 'body', code: 'invalid_json' }]);
  }
}
