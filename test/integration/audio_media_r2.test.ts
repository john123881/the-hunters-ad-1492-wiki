import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import app from '../../server/index';

const bytes = new TextEncoder().encode('0123456789abcdefghijklmnopqrstuvwxyz');

function object(range?: R2Range) {
  const bodyBytes = range && 'offset' in range
    ? bytes.slice(range.offset ?? 0, (range.offset ?? 0) + (range.length ?? bytes.length))
    : bytes;
  return {
    key: 'quest/Q1.abc1234.mp3',
    version: '1',
    size: bytes.length,
    etag: 'etag',
    httpEtag: '"etag"',
    checksums: {},
    uploaded: new Date(),
    storageClass: 'Standard',
    range,
    body: new ReadableStream({ start(controller) { controller.enqueue(bodyBytes); controller.close(); } }),
    bodyUsed: false,
    writeHttpMetadata(headers: Headers) { headers.set('Content-Type', 'audio/mpeg'); },
  } as unknown as R2ObjectBody;
}

const bucket = {
  async head(key: string) {
    return key === 'quest/Q1.abc1234.mp3' ? object() : null;
  },
  async get(key: string, options?: R2GetOptions) {
    if (key !== 'quest/Q1.abc1234.mp3') return null;
    const hasRange = options?.range instanceof Headers && options.range.has('Range');
    return object(hasRange ? { offset: 0, length: 8 } : undefined);
  },
} as unknown as R2Bucket;

describe('R2 audio media route', () => {
  it('returns immutable metadata for HEAD requests', async () => {
    const response = await app.request('/media/audio/quest/Q1.abc1234.mp3', { method: 'HEAD' }, { AUDIO: bucket } as never);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.match(response.headers.get('cache-control') ?? '', /immutable/);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-length'), String(bytes.length));
  });

  it('supports byte ranges for browser seeking', async () => {
    const response = await app.request('/media/audio/quest/Q1.abc1234.mp3', {
      headers: { Range: 'bytes=0-7' },
    }, { AUDIO: bucket } as never);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 0-7/' + bytes.length);
    assert.equal(response.headers.get('content-length'), '8');
    assert.equal((await response.arrayBuffer()).byteLength, 8);
  });

  it('rejects unsafe paths and reports missing storage', async () => {
    const unsafe = await app.request('/media/audio/../secret.mp3', {}, { AUDIO: bucket } as never);
    const unavailable = await app.request('/media/audio/quest/Q1.abc1234.mp3', {}, {} as never);
    assert.ok(unsafe.status === 400 || unsafe.status === 404);
    assert.equal(unavailable.status, 503);
  });
});
