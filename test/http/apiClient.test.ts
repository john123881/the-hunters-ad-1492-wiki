import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, getApiErrorMessage, readApiError, readApiJson } from '../../src/lib/apiClient';

describe('Shared API client', () => {
  it('returns a typed successful JSON payload', async () => {
    const response = Response.json({ data: { version: 3 } });
    const payload = await readApiJson<{ data: { version: number } }>(response);
    assert.equal(payload.data.version, 3);
  });

  it('throws ApiError with status, code and conflict metadata', async () => {
    const conflict = { scope: 'WAGON', currentVersion: 4 };
    const response = Response.json(
      { error: { code: 'WAGON_VERSION_CONFLICT', message: 'conflict', conflict } },
      { status: 409 },
    );

    await assert.rejects(
      () => readApiJson(response),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 409);
        assert.equal(error.code, 'WAGON_VERSION_CONFLICT');
        assert.deepEqual(error.conflict, conflict);
        return true;
      },
    );
  });

  it('uses the caller fallback for a non-JSON response', async () => {
    const response = new Response('gateway unavailable', { status: 502 });
    const error = await readApiError(response, 'temporary failure');
    assert.equal(error.message, 'temporary failure');
    assert.equal(error.status, 502);
    assert.equal(error.code, 'UNKNOWN_ERROR');
  });

  it('extracts a standard API message and otherwise keeps the fallback', () => {
    assert.equal(getApiErrorMessage({ error: { code: 'INVALID', message: 'invalid value' } }, 'fallback'), 'invalid value');
    assert.equal(getApiErrorMessage({ message: 'unexpected' }, 'fallback'), 'fallback');
  });
});
