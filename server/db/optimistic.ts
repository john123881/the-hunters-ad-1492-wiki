import { sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

/**
 * 樂觀鎖 Batch 執行選項：
 * 明確區分 beforeUpdate（例如帶有條件的日誌）、主要 update、以及 afterUpdate
 */
export interface OptimisticBatchOptions {
  beforeUpdate?: BatchItem<'sqlite'>[];
  update: BatchItem<'sqlite'>;
  afterUpdate?: BatchItem<'sqlite'>[];
}

/**
 * 將 Drizzle Query 或 db.run(sql`...`) 轉為 Cloudflare 原生 D1PreparedStatement
 */
export function toD1PreparedStatement(d1: D1Database, query: BatchItem<'sqlite'>): D1PreparedStatement {
  const prepared = (
    query as unknown as { _prepare(): { getQuery(): { sql: string; params: unknown[] } } }
  )._prepare();
  const built = prepared.getQuery();
  return d1.prepare(built.sql).bind(...built.params);
}

/**
 * 執行帶有樂觀鎖的批次交易
 * 確保 Log 先於 Update 執行（避免 Update 變更版本後 Log 無法匹配），
 * 並精確檢查主要 Update statement 的 meta.changes 是否大於 0。
 *
 * @returns boolean - true 表示主更新成功（changes > 0）；false 表示版本衝突或條件不符（changes === 0）
 */
export async function executeOptimisticBatch(
  d1: D1Database,
  options: OptimisticBatchOptions,
): Promise<boolean> {
  const before = options.beforeUpdate ?? [];
  const after = options.afterUpdate ?? [];

  const statements = [
    ...before.map(q => toD1PreparedStatement(d1, q)),
    toD1PreparedStatement(d1, options.update),
    ...after.map(q => toD1PreparedStatement(d1, q)),
  ];

  const results = await d1.batch(statements);
  // 精準定位 update statement 的結果
  const updateResult = results[before.length];
  return (updateResult?.meta.changes ?? 0) > 0;
}

/**
 * 馬車日誌 Builder（受限於 campaigns.version = expectedVersion）
 */
export function buildWagonGuardedLog(params: {
  campaignId: string;
  expectedVersion: number;
  playerNumber: number;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  return sql`
    INSERT INTO wagon_activity_logs (
      campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json
    )
    SELECT
      ${params.campaignId},
      ${params.playerNumber},
      ${params.actionType},
      ${params.entityType},
      ${params.entityId},
      ${params.beforeJson ?? null},
      ${params.afterJson ?? null}
    WHERE EXISTS (
      SELECT 1 FROM campaign_wagons
      WHERE campaign_id = ${params.campaignId}
        AND version = ${params.expectedVersion}
    )
  `;
}

/**
 * 角色日誌 Builder（受限於 campaign_characters.version = expectedVersion 且 player_number 相同）
 */
export function buildCharacterGuardedLog(params: {
  campaignId: string;
  playerNumber: number;
  expectedVersion: number;
  actorPlayerNumber: number;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  return sql`
    INSERT INTO character_activity_logs (
      campaign_id, actor_player_number, target_player_number, action_type, entity_type, entity_id, before_json, after_json
    )
    SELECT
      ${params.campaignId},
      ${params.actorPlayerNumber},
      ${params.playerNumber},
      ${params.actionType},
      ${params.entityType},
      ${params.entityId},
      ${params.beforeJson ?? null},
      ${params.afterJson ?? null}
    WHERE EXISTS (
      SELECT 1 FROM campaign_characters
      WHERE campaign_id = ${params.campaignId}
        AND player_number = ${params.playerNumber}
        AND version = ${params.expectedVersion}
    )
  `;
}

/**
 * 地圖日誌 Builder（受限於 campaign_maps.version = expectedVersion）
 */
export function buildMapGuardedLog(params: {
  campaignId: string;
  expectedVersion: number;
  playerNumber: number;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  return sql`
    INSERT INTO map_activity_logs (
      campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json
    )
    SELECT
      ${params.campaignId},
      ${params.playerNumber},
      ${params.actionType},
      ${params.entityType},
      ${params.entityId},
      ${params.beforeJson ?? null},
      ${params.afterJson ?? null}
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps
      WHERE campaign_id = ${params.campaignId}
        AND version = ${params.expectedVersion}
    )
  `;
}
