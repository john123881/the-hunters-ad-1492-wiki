import type { Context } from 'hono';
import type { AuthSession } from '../shared/types';
import { heroDefinitionBySlug } from '../shared/heroesData';
import { requireCampaignSession } from './auth';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

function error(c: Ctx, status: 400 | 403 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}
async function body(c: Ctx) { try { return await c.req.json<Record<string, unknown>>(); } catch { return null; } }
const integer = (value: unknown, min: number, max: number) => {
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max ? result : null;
};

async function loadCharacters(db: D1Database, session: AuthSession) {
  const rows = await db.prepare(`
    SELECT id, player_number, hero_slug, custom_name, morale_position, strength_level,
      knowledge_level, perception_level, agility_level, max_health_level, current_health,
      xp_tens, xp_ones, is_poisoned, notes, version
    FROM campaign_characters WHERE campaign_id = ? ORDER BY player_number
  `).bind(session.campaignId).all<Record<string, string | number>>();
  return rows.results.map(row => ({
    id: Number(row.id), playerNumber: Number(row.player_number), heroSlug: String(row.hero_slug),
    customName: String(row.custom_name), moralePosition: Number(row.morale_position),
    strengthLevel: Number(row.strength_level), knowledgeLevel: Number(row.knowledge_level),
    perceptionLevel: Number(row.perception_level), agilityLevel: Number(row.agility_level),
    maxHealthLevel: Number(row.max_health_level), currentHealth: Number(row.current_health),
    xpTens: Number(row.xp_tens), xpOnes: Number(row.xp_ones),
    isPoisoned: Number(row.is_poisoned) === 1, notes: String(row.notes), version: Number(row.version),
  }));
}

export async function getCampaignCharacters(c: Ctx) {
  const session = await requireCampaignSession(c);
  return c.json({ data: { characters: await loadCharacters(c.env.DB, session) } });
}

export async function saveCampaignCharacter(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  if (playerNumber !== session.playerNumber) return error(c, 403, 'CHARACTER_READ_ONLY', '只能修改自己的角色。');
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
  const expectedVersion = input.expectedVersion == null ? null : integer(input.expectedVersion, 1, 1_000_000);
  const before = await c.env.DB.prepare('SELECT * FROM campaign_characters WHERE campaign_id = ? AND player_number = ?')
    .bind(session.campaignId, playerNumber).first<Record<string, unknown>>();
  if (before && expectedVersion !== Number(before.version)) return error(c, 409, 'CHARACTER_VERSION_CONFLICT', '角色資料已被更新，請重新載入後再試。');
  try {
    const statements = [
      c.env.DB.prepare(`
        INSERT INTO campaign_characters
          (campaign_id, player_number, hero_slug, custom_name, morale_position, strength_level,
           knowledge_level, perception_level, agility_level, max_health_level, current_health,
           xp_tens, xp_ones, is_poisoned, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(campaign_id, player_number) DO UPDATE SET
          hero_slug = excluded.hero_slug, custom_name = excluded.custom_name,
          morale_position = excluded.morale_position, strength_level = excluded.strength_level,
          knowledge_level = excluded.knowledge_level, perception_level = excluded.perception_level,
          agility_level = excluded.agility_level, max_health_level = excluded.max_health_level,
          current_health = excluded.current_health, xp_tens = excluded.xp_tens, xp_ones = excluded.xp_ones,
          is_poisoned = excluded.is_poisoned, notes = excluded.notes,
          version = campaign_characters.version + 1, updated_at = datetime('now')
      `).bind(session.campaignId, playerNumber, heroSlug, customName, values.moralePosition, values.strengthLevel,
        values.knowledgeLevel, values.perceptionLevel, values.agilityLevel, values.maxHealthLevel,
        values.currentHealth, values.xpTens, values.xpOnes, input.isPoisoned === true ? 1 : 0, notes),
      c.env.DB.prepare(`
        INSERT INTO character_activity_logs
          (campaign_id, actor_player_number, target_player_number, action_type, entity_type, entity_id, before_json, after_json)
        VALUES (?, ?, ?, ?, 'CHARACTER', ?, ?, ?)
      `).bind(session.campaignId, session.playerNumber, playerNumber, before ? 'UPDATE_CHARACTER' : 'CREATE_CHARACTER',
        String(playerNumber), before ? JSON.stringify(before) : null, JSON.stringify({ heroSlug, customName, ...values, isPoisoned: input.isPoisoned === true, notes })),
    ];
    await c.env.DB.batch(statements);
  } catch (cause) {
    if (String(cause).includes('UNIQUE constraint failed')) return error(c, 409, 'HERO_ALREADY_SELECTED', '這位獵人已由同戰役的其他玩家選擇。');
    throw cause;
  }
  return c.json({ data: { characters: await loadCharacters(c.env.DB, session) } });
}
