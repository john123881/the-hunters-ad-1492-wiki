import type { Context } from 'hono';

type Env = { Bindings: { AUDIO?: R2Bucket } };
type Ctx = Context<Env>;

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

function audioKey(c: Ctx): string | null {
  const prefix = '/media/audio/';
  const key = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : '';
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\') || !/^[a-z0-9_/-]+\.[a-f0-9]+\.mp3$/i.test(key)) {
    return null;
  }
  return key;
}

function objectHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', IMMUTABLE_CACHE);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mpeg');
  return headers;
}

export async function getAudioMedia(c: Ctx) {
  const key = audioKey(c);
  if (!key) return c.json({ error: { code: 'INVALID_AUDIO_PATH', message: '音訊路徑格式不正確。' } }, 400);
  if (!c.env.AUDIO) return c.json({ error: { code: 'AUDIO_STORAGE_UNAVAILABLE', message: '正式音訊儲存空間尚未設定。' } }, 503);

  if (c.req.method === 'HEAD') {
    const object = await c.env.AUDIO.head(key);
    if (!object) return c.json({ error: { code: 'AUDIO_NOT_FOUND', message: '找不到音訊檔案。' } }, 404);
    const headers = objectHeaders(object);
    headers.set('Content-Length', String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const requestedRange = c.req.header('Range');
  const object = await c.env.AUDIO.get(key, requestedRange ? { range: c.req.raw.headers } : undefined);
  if (!object) return c.json({ error: { code: 'AUDIO_NOT_FOUND', message: '找不到音訊檔案。' } }, 404);

  const headers = objectHeaders(object);
  let status = 200;
  if (requestedRange && object.range) {
    status = 206;
    let start = 0;
    let length = object.size;
    if ('suffix' in object.range) {
      length = Math.min(object.range.suffix, object.size);
      start = object.size - length;
    } else {
      start = object.range.offset ?? 0;
      length = object.range.length ?? object.size - start;
    }
    headers.set('Content-Range', 'bytes ' + start + '-' + (start + length - 1) + '/' + object.size);
    headers.set('Content-Length', String(length));
  } else {
    headers.set('Content-Length', String(object.size));
  }

  return new Response(object.body, { status, headers });
}
