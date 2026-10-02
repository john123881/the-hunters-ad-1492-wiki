import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, InvalidQuery } from '../../server/query';

describe('Item Query Parsing (/server/query.ts)', () => {

  describe('parseQuery 邊界保護', () => {
    it('預設值正確：page=1, pageSize=12, sort=number, q=""', () => {
      const q = parseQuery({});
      assert.equal(q.page, 1);
      assert.equal(q.pageSize, 12);
      assert.equal(q.sort, 'number');
      assert.equal(q.q, '');
    });

    it('合法分頁參數正常解析', () => {
      const q = parseQuery({ page: '5', pageSize: '24' });
      assert.equal(q.page, 5);
      assert.equal(q.pageSize, 24);
    });

    it('非法分頁（小於 1 或非數字）拋出 InvalidQuery', () => {
      assert.throws(() => parseQuery({ page: '0' }), InvalidQuery);
      assert.throws(() => parseQuery({ page: '-1' }), InvalidQuery);
      assert.throws(() => parseQuery({ page: 'abc' }), InvalidQuery);
      assert.throws(() => parseQuery({ pageSize: '0' }), InvalidQuery);
      assert.throws(() => parseQuery({ pageSize: '100' }), InvalidQuery); // 上限 48
    });

    it('搜尋關鍵字長度超過 100 字拋出 InvalidQuery', () => {
      const longTerm = 'a'.repeat(101);
      assert.throws(() => parseQuery({ q: longTerm }), InvalidQuery);
    });

    it('正常搜尋關鍵字保留', () => {
      const q = parseQuery({ q: '十字弓' });
      assert.equal(q.q, '十字弓');
    });
  });
});
