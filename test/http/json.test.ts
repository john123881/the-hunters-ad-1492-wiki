import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonBody } from '../../server/http/json';

describe('Shared parseJsonBody Helper (/server/http/json.ts)', () => {
  it('合法的 JSON 物件能成功解析並回傳 { success: true, data }', async () => {
    const fakeContext: any = {
      req: {
        async json() {
          return { name: 'Franz', level: 2 };
        },
      },
    };

    const result = await parseJsonBody<{ name: string; level: number }>(fakeContext);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data, { name: 'Franz', level: 2 });
    }
  });

  it('無效的 JSON 時回傳 { success: false, response } 且預設 400 與 INVALID_JSON', async () => {
    let sentStatus = 0;
    let sentPayload: any = null;
    const fakeContext: any = {
      req: {
        async json() {
          throw new SyntaxError('Unexpected token in JSON');
        },
      },
      json(payload: any, status: number) {
        sentStatus = status;
        sentPayload = payload;
        return { payload, status };
      },
    };

    const result = await parseJsonBody(fakeContext);
    assert.equal(result.success, false);
    assert.equal(sentStatus, 400);
    assert.deepEqual(sentPayload, {
      error: {
        code: 'INVALID_JSON',
        message: '請提供有效的 JSON 資料。',
      },
    });
  });

  it('合法 JSON 但不是物件時仍回傳 400', async () => {
    for (const value of [null, [], 'text', 42, true]) {
      let sentStatus = 0;
      let sentPayload: any = null;
      const fakeContext: any = {
        req: {
          async json() {
            return value;
          },
        },
        json(payload: any, status: number) {
          sentStatus = status;
          sentPayload = payload;
          return { payload, status };
        },
      };

      const result = await parseJsonBody(fakeContext);
      assert.equal(result.success, false);
      assert.equal(sentStatus, 400);
      assert.deepEqual(sentPayload, {
        error: {
          code: 'INVALID_JSON',
          message: '請提供有效的 JSON 資料。',
        },
      });
    }
  });

  it('可自訂錯誤碼與錯誤訊息', async () => {
    let sentStatus = 0;
    let sentPayload: any = null;
    const fakeContext: any = {
      req: {
        async json() {
          throw new Error('Malformed JSON');
        },
      },
      json(payload: any, status: number) {
        sentStatus = status;
        sentPayload = payload;
        return { payload, status };
      },
    };

    const result = await parseJsonBody(fakeContext, {
      code: 'INVALID_BACKUP_JSON',
      message: '備份檔不是有效的 JSON。',
    });

    assert.equal(result.success, false);
    assert.equal(sentStatus, 400);
    assert.deepEqual(sentPayload, {
      error: {
        code: 'INVALID_BACKUP_JSON',
        message: '備份檔不是有效的 JSON。',
      },
    });
  });
});
