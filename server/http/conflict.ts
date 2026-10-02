import type { Context } from 'hono';
import type {
  CampaignWagon,
  CampaignMap,
  CampaignCharacter,
  ApiErrorResponse,
} from '../../shared/types';

export type ConflictScope = 'WAGON' | 'MAP' | 'CHARACTER';

export type LatestDataMap = {
  WAGON: CampaignWagon;
  MAP: CampaignMap;
  CHARACTER: CampaignCharacter[];
};

export const CONFLICT_MESSAGES: Record<ConflictScope, { code: string; message: string }> = {
  WAGON: {
    code: 'WAGON_VERSION_CONFLICT',
    message: '馬車資料已被其他玩家更新。',
  },
  MAP: {
    code: 'MAP_VERSION_CONFLICT',
    message: '地圖資料已被其他玩家更新。',
  },
  CHARACTER: {
    code: 'CHARACTER_VERSION_CONFLICT',
    message: '角色資料已被其他玩家更新。',
  },
};

/**
 * Parses expectedVersion ensuring it is an integer >= 0, returning null if invalid/missing.
 */
export function parseExpectedVersion(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? num : null;
}

export interface BuildConflictPayloadOptions<S extends ConflictScope> {
  scope: S;
  expectedVersion: number | null;
  currentVersion: number;
  latest: LatestDataMap[S];
}

/**
 * Builds the canonical 409 ApiErrorResponse payload for optimistic concurrency conflicts.
 */
export function buildConflictPayload<S extends ConflictScope>(
  options: BuildConflictPayloadOptions<S>,
): ApiErrorResponse {
  const { scope, expectedVersion, currentVersion, latest } = options;
  const { code, message } = CONFLICT_MESSAGES[scope];

  return {
    error: {
      code,
      message,
      conflict: {
        scope,
        expectedVersion: parseExpectedVersion(expectedVersion),
        currentVersion,
        latest,
      },
    },
  };
}

/**
 * Responds with a standard 409 JSON response containing the canonical version conflict payload.
 */
export function respondVersionConflict<S extends ConflictScope>(
  c: Context,
  options: BuildConflictPayloadOptions<S>,
) {
  const payload = buildConflictPayload(options);
  return c.json(payload, 409);
}
