import { describe, expect, it } from 'vitest';
import { MAX_JSON_BODY_BYTES, readJsonBody } from '@/server/http/read-json';
import { mapError } from '@/server/http/map-error';

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  let cancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('http://localhost/api/v1/test', {
    method: 'POST',
    body,
    headers,
    duplex: 'half',
  } as RequestInit);
  return { request, cancelled: () => cancelled };
}

const encode = (text: string) => new TextEncoder().encode(text);

describe('JSON transport byte limit [DG-10]', () => {
  it('cancels remaining input after invalid UTF-8', async () => {
    const input = streamed([
      Uint8Array.from([0xff]),
      encode('unused'),
      encode('unused'),
    ]);
    await expect(readJsonBody(input.request)).rejects.toMatchObject({
      status: 400,
    });
    expect(input.cancelled()).toBe(true);
  });
  it('accepts JSON exactly at the byte boundary', async () => {
    const text = `"${'a'.repeat(MAX_JSON_BODY_BYTES - 2)}"`;
    expect(
      ((await readJsonBody(streamed([encode(text)]).request)) as string).length,
    ).toBe(MAX_JSON_BODY_BYTES - 2);
  });
  it('rejects a chunked oversized body even with a false Content-Length and cancels it', async () => {
    const input = streamed(
      [new Uint8Array(MAX_JSON_BODY_BYTES), encode('x'), encode('unused')],
      { 'content-length': '1' },
    );
    await expect(readJsonBody(input.request)).rejects.toMatchObject({
      status: 413,
      code: 'BODY_TOO_LARGE',
    });
    expect(input.cancelled()).toBe(true);
  });
  it('counts UTF-8 bytes instead of JavaScript characters', async () => {
    const input = streamed([
      encode(`"${'ї'.repeat(MAX_JSON_BODY_BYTES / 2)}"`),
    ]);
    await expect(readJsonBody(input.request)).rejects.toMatchObject({
      status: 413,
    });
  });
  it('rejects oversized declared length before consuming the stream', async () => {
    const input = streamed([encode('{}')], {
      'content-length': String(MAX_JSON_BODY_BYTES + 1),
    });
    await expect(readJsonBody(input.request)).rejects.toMatchObject({
      status: 413,
    });
    expect(input.cancelled()).toBe(true);
  });
  it('decodes Unicode split between chunks', async () => {
    const bytes = encode('"ї"');
    expect(
      await readJsonBody(streamed([bytes.slice(0, 2), bytes.slice(2)]).request),
    ).toBe('ї');
  });
  it.each([encode('{'), Uint8Array.from([0x22, 0xff, 0x22])])(
    'rejects malformed JSON or UTF-8 without echoing input',
    async (bytes) => {
      await expect(
        readJsonBody(streamed([bytes]).request),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body', code: 'invalid_json' }],
      });
    },
  );
  it('maps the size error to a secret-free problem response', async () => {
    const input = streamed([new Uint8Array(MAX_JSON_BODY_BYTES + 1)]);
    try {
      await readJsonBody(input.request);
      throw new Error('Expected body rejection');
    } catch (error) {
      const response = mapError(error, '00000000-0000-4000-8000-000000000001');
      expect(response?.status).toBe(413);
      expect(await response?.json()).toMatchObject({
        code: 'BODY_TOO_LARGE',
        status: 413,
      });
    }
  });
});
