import { sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { toD1PreparedStatement } from './batch';

export { toD1PreparedStatement };

/**
 * 樂觀鎖 Batch 執行選項：
 * 明確區分 beforeUpdate（例如帶有條件的日誌）、主要 update、以及 afterUpdate
 */
export interface OptimisticBatchOptions {
  beforeUpdate?: readonly BatchItem<'sqlite'>[];
  update: BatchItem<'sqlite'>;
  afterUpdate?: readonly BatchItem<'sqlite'>[];
}

/**
 * 樂觀鎖 Batch 執行結果結構
 */
export type OptimisticBatchResult =
  | { status: 'updated'; results: D1Result[] }
  | { status: 'conflict'; results: D1Result[] };

/**
 * 安全轉換 JSON 字串，統一處理 undefined, null, 物件與陣列
 */
export function safeJsonStringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

/**
 * 執行帶有樂觀鎖的批次交易
 * 確保 Log 先於 Update 執行（避免 Update 變更版本後 Log 無法匹配），
 * 並精確檢查主要 Update statement 的 meta.changes 是否大於 0。
 *
 * @returns OptimisticBatchResult - 包含 status ('updated' | 'conflict') 與原生 D1Result[]
 */
export async function executeOptimisticBatch(
  d1: D1Database,
  options: OptimisticBatchOptions,
): Promise<OptimisticBatchResult> {
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
  const isUpdated = (updateResult?.meta.changes ?? 0) > 0;

  return {
    status: isUpdated ? 'updated' : 'conflict',
    results,
  };
}

/**
 * 馬車日誌 Builder（受限於 campaign_wagons.version = expectedVersion）
 */
export function buildWagonGuardedLog(params: {
  campaignId: string;
  expectedVersion: number;
  playerNumber: number;
  actionType: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  const beforeVal = params.beforeJson !== undefined ? params.beforeJson : safeJsonStringify(params.before);
  const afterVal = params.afterJson !== undefined ? params.afterJson : safeJsonStringify(params.after);

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
      ${beforeVal},
      ${afterVal}
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
  before?: unknown;
  after?: unknown;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  const beforeVal = params.beforeJson !== undefined ? params.beforeJson : safeJsonStringify(params.before);
  const afterVal = params.afterJson !== undefined ? params.afterJson : safeJsonStringify(params.after);

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
      ${beforeVal},
      ${afterVal}
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
  before?: unknown;
  after?: unknown;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  const beforeVal = params.beforeJson !== undefined ? params.beforeJson : safeJsonStringify(params.before);
  const afterVal = params.afterJson !== undefined ? params.afterJson : safeJsonStringify(params.after);

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
      ${beforeVal},
      ${afterVal}
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps
      WHERE campaign_id = ${params.campaignId}
        AND version = ${params.expectedVersion}
    )
  `;
}

/**
 * 馬車日誌 Builder（受限於地圖版本 campaign_maps.version = expectedVersion，例如完成卡片時跨表連帶移除 Time Token）
 */
export function buildWagonGuardedLogOnMapResolution(params: {
  campaignId: string;
  expectedMapVersion: number;
  playerNumber: number;
  tokenId: number;
  cardCode: string;
  tokenCode: string;
}) {
  const beforeJson = safeJsonStringify({ status: 'ACTIVE', storyCardCode: params.cardCode, tokenCode: params.tokenCode });
  const afterJson = safeJsonStringify({ status: 'REMOVED', storyCardCode: params.cardCode, reason: 'CARD_RESOLVED' });

  return sql`
    INSERT INTO wagon_activity_logs (
      campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json
    )
    SELECT
      ${params.campaignId},
      ${params.playerNumber},
      'REMOVE_TIME_TOKEN_ON_CARD_RESOLUTION',
      'TIME_TOKEN',
      ${String(params.tokenId)},
      ${beforeJson},
      ${afterJson}
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps
      WHERE campaign_id = ${params.campaignId}
        AND version = ${params.expectedMapVersion}
    )
  `;
}
