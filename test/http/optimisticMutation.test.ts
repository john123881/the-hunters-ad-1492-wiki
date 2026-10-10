import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { executeOptimisticMutation } from '../../src/lib/useOptimisticSave';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Optimistic mutation core', () => {
  it('adds expectedVersion and returns saved data', async () => {
    let sentBody: unknown;
    globalThis.fetch = async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return Response.json({ data: { version: 4 } }, { status: 201 });
    };

    const result = await executeOptimisticMutation<{ version: number }, { value: number }>({
      url: '/api/example',
      method: 'PATCH',
      payload: { value: 2 },
      expectedVersion: 3,
    });

    assert.deepEqual(sentBody, { value: 2, expectedVersion: 3 });
    assert.equal(result.status, 'saved');
    if (result.status === 'saved') {
      assert.equal(result.data.version, 4);
      assert.equal(result.responseStatus, 201);
    }
  });

  it('returns typed conflict data and rolls back optimistic state', async () => {
    let value = 1;
    globalThis.fetch = async () => Response.json({
      error: {
        code: 'WAGON_VERSION_CONFLICT',
        message: 'conflict',
        conflict: {
          scope: 'WAGON',
          expectedVersion: 2,
          currentVersion: 3,
          latest: { value: 7 },
        },
      },
    }, { status: 409 });

    const result = await executeOptimisticMutation<{ value: number }, { value: number }, { value: number }>({
      url: '/api/example',
      payload: { value: 2 },
      expectedVersion: 2,
      optimisticUpdate: () => { value = 2; },
      rollback: () => { value = 1; },
      computeChangedFields: () => ['value'],
    });

    assert.equal(value, 1);
    assert.equal(result.status, 'conflict');
    if (result.status === 'conflict') {
      assert.equal(result.conflict.currentVersion, 3);
      assert.deepEqual(result.conflict.latest, { value: 7 });
      assert.deepEqual(result.conflict.changedFields, ['value']);
    }
  });

  it('rolls back when the network request fails', async () => {
    let value = 1;
    globalThis.fetch = async () => { throw new Error('offline'); };

    const result = await executeOptimisticMutation<{ value: number }, { value: number }>({
      url: '/api/example',
      payload: { value: 2 },
      optimisticUpdate: () => { value = 2; },
      rollback: () => { value = 1; },
    });

    assert.equal(value, 1);
    assert.equal(result.status, 'error');
    if (result.status === 'error') {
      assert.equal(result.error.code, 'NETWORK_ERROR');
      assert.equal(result.error.status, 0);
    }
  });
});
