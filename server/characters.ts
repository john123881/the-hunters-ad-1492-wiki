import type { Context } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import type { AuthSession } from '../shared/types';
import { heroDefinitionBySlug } from '../shared/heroesData';
import { requireCampaignSession } from './auth';
import { getDb, runD1Batch } from './db';
import { executeOptimisticBatch, buildCharacterGuardedLog } from './db/optimistic';
import { campaignCharacters, characterActivityLogs } from './db/schema';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

function error(c: Ctx, status: 400 | 403 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function body(c: Ctx) {
  try {
    return await c.req.json<Record<string, unknown>>();
  } catch {
    return null;
  }
}

const integer = (value: unknown, min: number, max: number) => {
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max ? result : null;
};

async function loadCharacters(db: ReturnType<typeof getDb>, session: AuthSession) {
  const rows = await db
    .select({
      id: campaignCharacters.id,
      playerNumber: campaignCharacters.playerNumber,
      heroSlug: campaignCharacters.heroSlug,
      customName: campaignCharacters.customName,
      moralePosition: campaignCharacters.moralePosition,
      strengthLevel: campaignCharacters.strengthLevel,
      knowledgeLevel: campaignCharacters.knowledgeLevel,
      perceptionLevel: campaignCharacters.perceptionLevel,
      agilityLevel: campaignCharacters.agilityLevel,
      maxHealthLevel: campaignCharacters.maxHealthLevel,
      currentHealth: campaignCharacters.currentHealth,
      xpTens: campaignCharacters.xpTens,
      xpOnes: campaignCharacters.xpOnes,
      isPoisoned: campaignCharacters.isPoisoned,
      notes: campaignCharacters.notes,
      version: campaignCharacters.version,
    })
    .from(campaignCharacters)
    .where(eq(campaignCharacters.campaignId, session.campaignId))
    .orderBy(campaignCharacters.playerNumber);

  return rows;
}

export async function getCampaignCharacters(c: Ctx) {
  const session = await requireCampaignSession(c);
  const db = getDb(c.env.DB);
  return c.json({ data: { characters: await loadCharacters(db, session) } });
}

export async function saveCampaignCharacter(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const input = await body(c);
  if (!input) return error(c, 400, 'INVALID_JSON', '請提供有效的角色資料。');
  const heroSlug = typeof input.heroSlug === 'string' ? input.heroSlug : '';
  if (!heroDefinitionBySlug[heroSlug]) return error(c, 400, 'INVALID_HERO', '請選擇有效的獵人。');
  const customName = typeof input.customName === 'string' ? input.customName.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (customName.length > 40 || notes.length > 2000) return error(c, 400, 'INVALID_TEXT', '角色名稱或備註過長。');
  const values = {
    moralePosition: integer(input.moralePosition, -2, 4),
    strengthLevel: integer(input.strengthLevel, 0, 4),
    knowledgeLevel: integer(input.knowledgeLevel, 0, 4),
    perceptionLevel: integer(input.perceptionLevel, 0, 4),
    agilityLevel: integer(input.agilityLevel, 0, 4),
    maxHealthLevel: integer(input.maxHealthLevel, 0, 5),
    currentHealth: integer(input.currentHealth, 0, 12),
    xpTens: integer(input.xpTens, 0, 90),
    xpOnes: integer(input.xpOnes, 0, 9),
  };
  if (Object.values(values).some(value => value === null) || Number(values.xpTens) % 10 !== 0) {
    return error(c, 400, 'INVALID_CHARACTER_STATE', '角色面板位置超出可用範圍。');
  }

  const db = getDb(c.env.DB);
  const expectedVersion = input.expectedVersion == null ? null : integer(input.expectedVersion, 1, 1_000_000);

  const [before] = await db
    .select()
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, session.campaignId),
        eq(campaignCharacters.playerNumber, playerNumber)
      )
    );

  if (before && expectedVersion !== Number(before.version)) {
    const latest = await loadCharacters(db, session);
    return c.json({
      error: {
        code: 'CHARACTER_VERSION_CONFLICT',
        message: '角色資料已被其他玩家更新。',
        conflict: {
          scope: 'CHARACTER',
          expectedVersion,
          currentVersion: Number(before.version),
          latest,
        },
      },
    }, 409);
  }

  const isPoisoned = input.isPoisoned === true;

  try {
    if (before) {
      if (expectedVersion == null) {
        const latest = await loadCharacters(db, session);
        return c.json({
          error: {
            code: 'CHARACTER_VERSION_CONFLICT',
            message: '缺少 expectedVersion 參數。',
            conflict: {
              scope: 'CHARACTER',
              expectedVersion: null,
              currentVersion: Number(before.version),
              latest,
            },
          },
        }, 409);
      }

      // [原因備註]: D1 batch 本身在更新 0 筆時不會報錯中斷，為了防止版本衝突時產生虛假 Log，
      // 此處透過 Drizzle sql 標籤搭配 WHERE EXISTS 守衛 Log 的寫入；最後由 versionStmt 更新版本並判定變更數。
      const updateDataStmt = db
        .update(campaignCharacters)
        .set({
          heroSlug,
          customName,
          moralePosition: values.moralePosition!,
          strengthLevel: values.strengthLevel!,
          knowledgeLevel: values.knowledgeLevel!,
          perceptionLevel: values.perceptionLevel!,
          agilityLevel: values.agilityLevel!,
          maxHealthLevel: values.maxHealthLevel!,
          currentHealth: values.currentHealth!,
          xpTens: values.xpTens!,
          xpOnes: values.xpOnes!,
          isPoisoned,
          notes,
          version: sql`${campaignCharacters.version} + 1`,
          updatedAt: sql`(datetime('now'))`,
        })
        .where(
          and(
            eq(campaignCharacters.campaignId, session.campaignId),
            eq(campaignCharacters.playerNumber, playerNumber),
            eq(campaignCharacters.version, expectedVersion),
          ),
        );

      // [原因備註]: D1 batch 衝突時不拋出例外（更新 0 筆仍會繼續執行）。
      // 故必須使用原生 sql INSERT ... SELECT ... WHERE EXISTS 確保只有在預期版本相符時才寫入日誌，
      // 防止版本衝突時寫入未發生的操作紀錄（Ghost Log）。
      const logStmt = db.run(buildCharacterGuardedLog({
        campaignId: session.campaignId,
        playerNumber,
        expectedVersion,
        actorPlayerNumber: session.playerNumber,
        actionType: 'UPDATE_CHARACTER',
        entityType: 'CHARACTER',
        entityId: String(playerNumber),
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify({ heroSlug, customName, ...values, isPoisoned, notes }),
      }));

      const isSuccess = await executeOptimisticBatch(c.env.DB, {
        beforeUpdate: [logStmt],
        update: updateDataStmt,
      });

      if (!isSuccess) {
        const latest = await loadCharacters(db, session);
        const [current] = await db
          .select({ version: campaignCharacters.version })
          .from(campaignCharacters)
          .where(
            and(
              eq(campaignCharacters.campaignId, session.campaignId),
              eq(campaignCharacters.playerNumber, playerNumber),
            ),
          );
        return c.json({
          error: {
            code: 'CHARACTER_VERSION_CONFLICT',
            message: '角色資料已被其他玩家更新。',
            conflict: {
              scope: 'CHARACTER',
              expectedVersion,
              currentVersion: Number(current?.version ?? before.version),
              latest,
            },
          },
        }, 409);
      }
    } else {
      const insertStmt = db.insert(campaignCharacters).values({
        campaignId: session.campaignId,
        playerNumber,
        heroSlug,
        customName,
        moralePosition: values.moralePosition!,
        strengthLevel: values.strengthLevel!,
        knowledgeLevel: values.knowledgeLevel!,
        perceptionLevel: values.perceptionLevel!,
        agilityLevel: values.agilityLevel!,
        maxHealthLevel: values.maxHealthLevel!,
        currentHealth: values.currentHealth!,
        xpTens: values.xpTens!,
        xpOnes: values.xpOnes!,
        isPoisoned,
        notes,
        version: 1,
      });

      const logStmt = db.insert(characterActivityLogs).values({
        campaignId: session.campaignId,
        actorPlayerNumber: session.playerNumber,
        targetPlayerNumber: playerNumber,
        actionType: 'CREATE_CHARACTER',
        entityType: 'CHARACTER',
        entityId: String(playerNumber),
        beforeJson: null,
        afterJson: JSON.stringify({ heroSlug, customName, ...values, isPoisoned, notes }),
      });

      await runD1Batch(c.env.DB, [insertStmt, logStmt]);
    }
  } catch (cause) {
    if (String(cause).includes('UNIQUE constraint failed')) {
      return error(c, 409, 'HERO_ALREADY_SELECTED', '這位獵人已由同戰役的其他玩家選擇。');
    }
    throw cause;
  }

  return c.json({ data: { characters: await loadCharacters(db, session) } });
}
