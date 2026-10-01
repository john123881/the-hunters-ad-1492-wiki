import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { campaignWagons } from '../server/db/schema/wagon';
import { runD1Batch } from '../server/db/index';

describe('D1 Batch & Optimistic Concurrency Tests', () => {
  // 建立符合 Cloudflare D1 介面的 Mock 物件
  function createMockD1() {
    const executed: Array<{ sql: string; params: unknown[] }> = [];
    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return { sql: sqlString, params };
          },
        };
      },
      async batch(stmts: Array<{ sql: string; params: unknown[] }>) {
        executed.push(...stmts);
        return stmts.map(() => ({
          success: true,
          meta: { changes: 1 },
          results: [],
        }));
      },
    };
    return { mockD1, executed };
  }

  it('重現 Drizzle 原生 db.batch 處理帶有參數的 db.run(sql`...`) 時會引發 TypeError (reading "bind")', async () => {
    const { mockD1 } = createMockD1();
    const db = drizzle(mockD1);

    // 關鍵：當 params.length > 0 時，Drizzle D1Session.batch 會嘗試呼叫 preparedQuery.stmt.bind
    // 但 db.run(sql`...`) 的 preparedQuery 並沒有 stmt 屬性，因此必然拋出 Cannot read properties of undefined (reading 'bind')
    const logStmt = db.run(sql`SELECT 1 WHERE 1 = ${123}`);

    await assert.rejects(
      async () => {
        await db.batch([logStmt]);
      },
      {
        name: 'TypeError',
        message: /Cannot read properties of undefined \(reading 'bind'\)/,
      },
    );
  });

  it('驗證 runD1Batch 可以正確解析 db.run(sql`...`) 與 Drizzle ORM query 並安全送入 D1 batch', async () => {
    const { mockD1, executed } = createMockD1();
    const db = drizzle(mockD1);

    const session = { campaignId: 'campaign-alpha', playerNumber: 2 };
    const before = { elapsedDays: 5 };
    const elapsedDays = 6;
    const expectedVersion = 3;

    // 1. 馬車天數活動日誌（帶有樂觀鎖 WHERE EXISTS 條件）
    const logStmt = db.run(sql`
      INSERT INTO wagon_activity_logs (
        campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json
      )
      SELECT ${session.campaignId}, ${session.playerNumber}, 'SET_ELAPSED_DAYS', 'WAGON', ${session.campaignId}, ${JSON.stringify({ elapsedDays: before?.elapsedDays ?? 1 })}, ${JSON.stringify({ elapsedDays })}
      WHERE EXISTS (
        SELECT 1 FROM campaign_wagons WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion}
      )
    `);

    // 2. 馬車天數與版本更新
    const updateStmt = db
      .update(campaignWagons)
      .set({
        elapsedDays,
        version: sql`${campaignWagons.version} + 1`,
        updatedByPlayer: session.playerNumber,
      });

    // 執行自訂的 runD1Batch
    const results = await runD1Batch(mockD1, [logStmt, updateStmt]);

    // 斷言驗證
    assert.equal(results.length, 2);
    assert.equal(results[0]?.meta.changes, 1);
    assert.equal(results[1]?.meta.changes, 1);

    // 驗證底層收到的 SQL 與參數已經正確綁定
    assert.equal(executed.length, 2);

    // 驗證 logStmt 的 SQL 與參數
    assert.match(executed[0].sql, /INSERT INTO wagon_activity_logs/);
    assert.match(executed[0].sql, /WHERE EXISTS/);
    assert.match(executed[0].sql, /campaign_wagons/);
    assert.deepEqual(executed[0].params, [
      'campaign-alpha',
      2,
      'campaign-alpha',
      '{"elapsedDays":5}',
      '{"elapsedDays":6}',
      'campaign-alpha',
      3,
    ]);

    // 驗證 updateStmt 的 SQL 與參數
    assert.match(executed[1].sql, /update "campaign_wagons" set/);
    assert.deepEqual(executed[1].params, [6, 2]);
  });

  it('驗證 executeOptimisticBatch 正確執行並精準依據 update 的 meta.changes 判定成功或衝突', async () => {
    const { executeOptimisticBatch, buildWagonGuardedLog } = await import('../server/db/optimistic');
    
    // 模擬成功情境：Update 影響 1 筆
    const successD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return { sql: sqlString, params };
          },
        };
      },
      async batch(stmts: Array<{ sql: string; params: unknown[] }>) {
        return [
          { success: true, meta: { changes: 1 }, results: [] }, // before (log)
          { success: true, meta: { changes: 1 }, results: [] }, // update (target)
        ];
      },
    };

    const dbSuccess = drizzle(successD1);
    const logStmt = dbSuccess.run(buildWagonGuardedLog({
      campaignId: 'camp-1',
      expectedVersion: 10,
      playerNumber: 1,
      actionType: 'UPGRADE_WORKSHOP',
      entityType: 'STATION',
      entityId: 'alchemist',
    }));

    const updateStmt = dbSuccess.update(campaignWagons).set({ elapsedDays: 20 });

    const successResult = await executeOptimisticBatch(successD1, {
      beforeUpdate: [logStmt],
      update: updateStmt,
    });
    assert.equal(successResult.status, 'updated', '當 update 影響大於 0 時 status 應為 updated');

    // 模擬版本衝突情境：Update 影響 0 筆（因 WHERE version = expectedVersion 不成立）
    const conflictD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return { sql: sqlString, params };
          },
        };
      },
      async batch(stmts: Array<{ sql: string; params: unknown[] }>) {
        return [
          { success: true, meta: { changes: 0 }, results: [] }, // log WHERE EXISTS 不成立
          { success: true, meta: { changes: 0 }, results: [] }, // update WHERE version 不成立
        ];
      },
    };

    const conflictResult = await executeOptimisticBatch(conflictD1, {
      beforeUpdate: [logStmt],
      update: updateStmt,
    });
    assert.equal(conflictResult.status, 'conflict', '當 update 影響為 0 時 status 應為 conflict');
  });
});

