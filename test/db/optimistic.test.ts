import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { campaignWagons } from '../../server/db/schema/wagon';
import {
  executeOptimisticBatch,
  buildWagonGuardedLog,
  buildMapGuardedLog,
  buildCharacterGuardedLog,
  buildWagonGuardedLogOnMapResolution,
  safeJsonStringify,
} from '../../server/db/optimistic';
import { toD1PreparedStatement } from '../../server/db/batch';

describe('Optimistic Concurrency & Guarded Logs Unit Tests', () => {
  function createSpyD1() {
    const executed: Array<{ sql: string; params: unknown[] }> = [];
    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            const entry = { sql: sqlString, params };
            return entry;
          },
        };
      },
      async batch(stmts: Array<{ sql: string; params: unknown[] }>) {
        executed.push(...stmts);
        return stmts.map((_, idx) => ({
          success: true,
          meta: { changes: 1 },
          results: [],
        }));
      },
    };
    return { mockD1, executed };
  }

  it('safeJsonStringify 能正確序列化物件、陣列並將 null 或 undefined 轉為 null', () => {
    assert.equal(safeJsonStringify(undefined), null);
    assert.equal(safeJsonStringify(null), null);
    assert.equal(safeJsonStringify({ foo: 'bar', num: 123 }), '{"foo":"bar","num":123}');
    assert.equal(safeJsonStringify([1, 2, 'three']), '[1,2,"three"]');
  });

  it('buildWagonGuardedLog 正確守衛 campaign_wagons.version', () => {
    const { mockD1 } = createSpyD1();
    const db = drizzle(mockD1);

    const logSql = buildWagonGuardedLog({
      campaignId: 'camp-wagon-1',
      expectedVersion: 7,
      playerNumber: 2,
      actionType: 'UPDATE_DAYS',
      entityType: 'WAGON',
      entityId: 'camp-wagon-1',
      before: { elapsedDays: 3 },
      after: { elapsedDays: 4 },
    });
    const logStmt = db.run(logSql);

    const stmt: any = toD1PreparedStatement(mockD1, logStmt);
    assert.ok(stmt.sql.includes('INSERT INTO wagon_activity_logs'));
    assert.ok(stmt.sql.includes('FROM campaign_wagons'), '必須守衛 campaign_wagons 表');
    assert.ok(stmt.sql.includes('version = ?'), '必須守衛 version');
    assert.deepEqual(stmt.params, [
      'camp-wagon-1',
      2,
      'UPDATE_DAYS',
      'WAGON',
      'camp-wagon-1',
      '{"elapsedDays":3}',
      '{"elapsedDays":4}',
      'camp-wagon-1',
      7,
    ]);
  });

  it('buildMapGuardedLog 正確守衛 campaign_maps.version', () => {
    const { mockD1 } = createSpyD1();
    const db = drizzle(mockD1);

    const logSql = buildMapGuardedLog({
      campaignId: 'camp-map-1',
      expectedVersion: 3,
      playerNumber: 1,
      actionType: 'REVEAL_TILE',
      entityType: 'MAP_TILE',
      entityId: 'M01_0_0',
      before: null,
      after: { isRevealed: true },
    });
    const logStmt = db.run(logSql);

    const stmt: any = toD1PreparedStatement(mockD1, logStmt);
    assert.ok(stmt.sql.includes('INSERT INTO map_activity_logs'));
    assert.ok(stmt.sql.includes('FROM campaign_maps'), '必須守衛 campaign_maps 表');
    assert.ok(stmt.sql.includes('version = ?'), '必須守衛 version');
    assert.deepEqual(stmt.params, [
      'camp-map-1',
      1,
      'REVEAL_TILE',
      'MAP_TILE',
      'M01_0_0',
      null,
      '{"isRevealed":true}',
      'camp-map-1',
      3,
    ]);
  });

  it('buildCharacterGuardedLog 正確守衛 campaign_characters 的 campaign_id, player_number 與 version', () => {
    const { mockD1 } = createSpyD1();
    const db = drizzle(mockD1);

    const logSql = buildCharacterGuardedLog({
      campaignId: 'camp-char-1',
      playerNumber: 3,
      expectedVersion: 5,
      actorPlayerNumber: 1,
      actionType: 'UPDATE_HEALTH',
      entityType: 'CHARACTER',
      entityId: '3',
      before: { currentHealth: 5 },
      after: { currentHealth: 4 },
    });
    const logStmt = db.run(logSql);

    const stmt: any = toD1PreparedStatement(mockD1, logStmt);
    assert.ok(stmt.sql.includes('INSERT INTO character_activity_logs'));
    assert.ok(stmt.sql.includes('FROM campaign_characters'), '必須守衛 campaign_characters 表');
    assert.ok(stmt.sql.includes('player_number = ?'), '必須守衛 player_number');
    assert.ok(stmt.sql.includes('version = ?'), '必須守衛 version');
    assert.deepEqual(stmt.params, [
      'camp-char-1',
      1,
      3,
      'UPDATE_HEALTH',
      'CHARACTER',
      '3',
      '{"currentHealth":5}',
      '{"currentHealth":4}',
      'camp-char-1',
      3,
      5,
    ]);
  });

  it('executeOptimisticBatch 確保執行順序為 beforeUpdate -> update -> afterUpdate，並以 update 的 index 判定結果', async () => {
    const { mockD1, executed } = createSpyD1();
    const db = drizzle(mockD1);

    const log1 = db.run(sql`SELECT 1`);
    const log2 = db.run(sql`SELECT 2`);
    const update = db.update(campaignWagons).set({ elapsedDays: 10 });
    const after1 = db.run(sql`SELECT 3`);

    const result = await executeOptimisticBatch(mockD1, {
      beforeUpdate: [log1, log2],
      update,
      afterUpdate: [after1],
    });

    assert.equal(result.status, 'updated');
    assert.equal(executed.length, 4);
    assert.ok(executed[0].sql.includes('SELECT 1'), '第 1 條應為 beforeUpdate[0]');
    assert.ok(executed[1].sql.includes('SELECT 2'), '第 2 條應為 beforeUpdate[1]');
    assert.match(executed[2].sql, /update "campaign_wagons" set/i, '第 3 條應為主要的 update');
    assert.ok(executed[3].sql.includes('SELECT 3'), '第 4 條應為 afterUpdate[0]');
  });

  it('buildWagonGuardedLogOnMapResolution 正確守衛 campaign_maps.version', () => {
    const { mockD1 } = createSpyD1();
    const db = drizzle(mockD1);

    const logSql = buildWagonGuardedLogOnMapResolution({
      campaignId: 'camp-map-token-1',
      expectedMapVersion: 12,
      playerNumber: 2,
      tokenId: 45,
      cardCode: 'S001',
      tokenCode: 'A',
    });
    const logStmt = db.run(logSql);

    const stmt: any = toD1PreparedStatement(mockD1, logStmt);
    assert.ok(stmt.sql.includes('INSERT INTO wagon_activity_logs'));
    assert.ok(stmt.sql.includes('FROM campaign_maps'), '必須守衛 campaign_maps 表');
    assert.ok(stmt.sql.includes('version = ?'), '必須守衛 version');
    assert.deepEqual(stmt.params, [
      'camp-map-token-1',
      2,
      '45',
      '{"status":"ACTIVE","storyCardCode":"S001","tokenCode":"A"}',
      '{"status":"REMOVED","storyCardCode":"S001","reason":"CARD_RESOLVED"}',
      'camp-map-token-1',
      12,
    ]);
  });

  it('executeOptimisticBatch 當 update 的 changes = 0 時精準回傳 conflict，不被其他語句的 changes 影響', async () => {
    // 模擬：beforeUpdate 執行成功 (changes = 1)，但 update 遭遇版本衝突 (changes = 0)，afterUpdate 亦為 1
    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return { sql: sqlString, params };
          },
        };
      },
      async batch(stmts: any[]) {
        return [
          { success: true, meta: { changes: 1 }, results: [] }, // beforeUpdate[0]
          { success: true, meta: { changes: 0 }, results: [] }, // update (發生衝突，0 rows updated)
          { success: true, meta: { changes: 1 }, results: [] }, // afterUpdate[0]
        ];
      },
    };
    const db = drizzle(mockD1);

    const result = await executeOptimisticBatch(mockD1, {
      beforeUpdate: [db.run(sql`SELECT 1`)],
      update: db.update(campaignWagons).set({ elapsedDays: 10 }),
      afterUpdate: [db.run(sql`SELECT 2`)],
    });

    assert.equal(result.status, 'conflict');
    assert.equal(result.results.length, 3);
    assert.equal(result.results[1].meta?.changes, 0);
  });

  it('executeOptimisticBatch 在沒有 beforeUpdate 與 afterUpdate 時（單一 update）正確運作', async () => {
    let batchLength = 0;
    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return { sql: sqlString, params };
          },
        };
      },
      async batch(stmts: any[]) {
        batchLength = stmts.length;
        return [{ success: true, meta: { changes: 1 }, results: [] }];
      },
    };
    const db = drizzle(mockD1);

    const result = await executeOptimisticBatch(mockD1, {
      update: db.update(campaignWagons).set({ elapsedDays: 20 }),
    });

    assert.equal(result.status, 'updated');
    assert.equal(batchLength, 1);
  });

  it('executeOptimisticBatch 當 D1 batch 拋出錯誤時，不吞掉例外並忠實向上拋出', async () => {
    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return { sql: sqlString, params };
          },
        };
      },
      async batch() {
        throw new Error('D1 database connection failed');
      },
    };
    const db = drizzle(mockD1);

    await assert.rejects(
      async () => {
        await executeOptimisticBatch(mockD1, {
          update: db.update(campaignWagons).set({ elapsedDays: 20 }),
        });
      },
      {
        name: 'Error',
        message: 'D1 database connection failed',
      },
    );
  });
});
