import type { AdminSession } from '../shared/types';

type JsonRow = Record<string, unknown>;

const FORMAT = 'the-hunters-campaign-backup';
const SCHEMA_VERSION = 2;

const tableColumns: Record<string, string[]> = {
  campaigns: ['id','campaign_name','password_hash','max_players','is_active','notes','created_at','updated_at','deleted_at'],
  campaign_players: ['campaign_id','player_number','player_alias','is_ready','created_at','updated_at'],
  campaign_wagons: ['campaign_id','elapsed_days','location_code','shared_gold','version','updated_by_player','created_at','updated_at','notes'],
  campaign_wagon_upgrades: ['campaign_id','station_id','level','updated_at'],
  campaign_wagon_resources: ['campaign_id','resource_id','quantity','updated_at'],
  campaign_characters: ['id','campaign_id','player_number','hero_slug','custom_name','morale_position','strength_level','knowledge_level','perception_level','agility_level','max_health_level','current_health','xp_tens','xp_ones','accumulated_xp','is_poisoned','notes','version','created_at','updated_at'],
  campaign_equipment_instances: ['id','campaign_id','item_id','location_type','character_id','damage_markers','notes','created_at','updated_at'],
  campaign_equipment_attachments: ['equipment_instance_id','attachment_instance_id','weapon_slot_index','socket_index','attached_at'],
  campaign_character_opened_slots: ['character_id','slot_key','opened_by_player','opened_at'],
  campaign_character_equipment_slots: ['campaign_id','character_id','equipment_instance_id','slot_key','slot_index','created_at'],
  campaign_character_retained_attachments: ['attachment_instance_id','campaign_id','character_id','anchor_slot_key','socket_index','retained_at'],
  campaign_cards_progress: ['id','campaign_id','card_code','card_type','status','updated_at'],
  campaign_card_time_tokens: ['id','campaign_id','story_card_progress_id','token_code','placed_at_day','unlock_at_day','status','removed_at','removed_by_player','created_at'],
  wagon_activity_logs: ['id','campaign_id','player_number','action_type','entity_type','entity_id','before_json','after_json','created_at'],
  campaign_maps: ['campaign_id','current_location_type','current_location_code','version','updated_by_player','created_at','updated_at','road_event_notes','town_event_notes'],
  campaign_map_tiles: ['campaign_id','map_code','row_index','column_index','is_revealed','face','resource_notes','notes','updated_at'],
  campaign_map_card_placements: ['id','campaign_id','card_code','card_type','status','location_type','location_code','notes','created_at','updated_at','is_in_town_deck'],
  map_activity_logs: ['id','campaign_id','player_number','action_type','entity_type','entity_id','before_json','after_json','created_at'],
  campaign_location_cards: ['campaign_id','location_code','is_revealed','face','resource_notes','notes','updated_at'],
  campaign_card_statuses: ['campaign_id','card_code','is_resolved','resolved_at','updated_by_player','updated_at'],
  character_activity_logs: ['id','campaign_id','actor_player_number','target_player_number','action_type','entity_type','entity_id','before_json','after_json','created_at'],
};

const exportQueries: Record<string, string> = {
  campaigns: 'SELECT * FROM campaigns WHERE id=?',
  campaign_players: 'SELECT * FROM campaign_players WHERE campaign_id=? ORDER BY player_number',
  campaign_wagons: 'SELECT * FROM campaign_wagons WHERE campaign_id=?',
  campaign_wagon_upgrades: 'SELECT * FROM campaign_wagon_upgrades WHERE campaign_id=? ORDER BY station_id',
  campaign_wagon_resources: 'SELECT * FROM campaign_wagon_resources WHERE campaign_id=? ORDER BY resource_id',
  campaign_characters: 'SELECT * FROM campaign_characters WHERE campaign_id=? ORDER BY player_number',
  campaign_equipment_instances: 'SELECT * FROM campaign_equipment_instances WHERE campaign_id=? ORDER BY id',
  campaign_equipment_attachments: 'SELECT a.* FROM campaign_equipment_attachments a JOIN campaign_equipment_instances e ON e.id=a.equipment_instance_id WHERE e.campaign_id=? ORDER BY a.equipment_instance_id,a.weapon_slot_index,a.socket_index',
  campaign_character_opened_slots: 'SELECT s.* FROM campaign_character_opened_slots s JOIN campaign_characters c ON c.id=s.character_id WHERE c.campaign_id=? ORDER BY s.character_id,s.slot_key',
  campaign_character_equipment_slots: 'SELECT * FROM campaign_character_equipment_slots WHERE campaign_id=? ORDER BY character_id,equipment_instance_id,slot_index',
  campaign_character_retained_attachments: 'SELECT * FROM campaign_character_retained_attachments WHERE campaign_id=? ORDER BY character_id,anchor_slot_key,socket_index',
  campaign_cards_progress: 'SELECT * FROM campaign_cards_progress WHERE campaign_id=? ORDER BY id',
  campaign_card_time_tokens: 'SELECT * FROM campaign_card_time_tokens WHERE campaign_id=? ORDER BY id',
  wagon_activity_logs: 'SELECT * FROM wagon_activity_logs WHERE campaign_id=? ORDER BY id',
  campaign_maps: 'SELECT * FROM campaign_maps WHERE campaign_id=?',
  campaign_map_tiles: 'SELECT * FROM campaign_map_tiles WHERE campaign_id=? ORDER BY row_index,column_index',
  campaign_map_card_placements: 'SELECT * FROM campaign_map_card_placements WHERE campaign_id=? ORDER BY id',
  map_activity_logs: 'SELECT * FROM map_activity_logs WHERE campaign_id=? ORDER BY id',
  campaign_location_cards: 'SELECT * FROM campaign_location_cards WHERE campaign_id=? ORDER BY location_code',
  campaign_card_statuses: 'SELECT * FROM campaign_card_statuses WHERE campaign_id=? ORDER BY card_code',
  character_activity_logs: 'SELECT * FROM character_activity_logs WHERE campaign_id=? ORDER BY id',
};

export type CampaignBackup = {
  format: typeof FORMAT;
  schemaVersion: number;
  exportedAt: string;
  campaignId: string;
  tables: Record<string, JsonRow[]>;
  adminActivityLogs: JsonRow[];
};

export async function buildCampaignBackup(db: D1Database, campaignId: string): Promise<CampaignBackup | null> {
  const campaign = await db.prepare('SELECT id FROM campaigns WHERE id=? AND deleted_at IS NULL').bind(campaignId).first();
  if (!campaign) return null;
  const tables: Record<string, JsonRow[]> = {};
  for (const [name, query] of Object.entries(exportQueries)) {
    const result = await db.prepare(query).bind(campaignId).all<JsonRow>();
    tables[name] = result.results;
  }
  const adminLogs = await db.prepare(`
    SELECT u.username AS admin_username,l.action_type,l.entity_type,l.entity_id,l.before_json,l.after_json,l.created_at
    FROM admin_activity_logs l JOIN admin_users u ON u.id=l.admin_user_id
    WHERE l.entity_type='CAMPAIGN' AND l.entity_id=? ORDER BY l.id
  `).bind(campaignId).all<JsonRow>();
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), campaignId, tables, adminActivityLogs: adminLogs.results };
}

function isRow(value: unknown): value is JsonRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBackup(value: unknown): unknown {
  if (!isRow(value) || value.format !== FORMAT || !isRow(value.tables)) return value;
  if (value.schemaVersion !== 1) return value;
  const tables = { ...value.tables };
  const attachments = Array.isArray(tables.campaign_equipment_attachments)
    ? tables.campaign_equipment_attachments.map(row => isRow(row)
      ? { ...row, weapon_slot_index: row.weapon_slot_index ?? 1 }
      : row)
    : [];
  return {
    ...value,
    schemaVersion: SCHEMA_VERSION,
    tables: {
      ...tables,
      campaign_equipment_attachments: attachments,
      campaign_character_opened_slots: [],
      campaign_character_equipment_slots: [],
      campaign_character_retained_attachments: [],
    },
  };
}

function validateBackup(input: unknown, campaignId: string): CampaignBackup {
  const value = normalizeBackup(input);
  if (!isRow(value) || value.format !== FORMAT || value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('備份格式或版本不支援。');
  }
  if (value.campaignId !== campaignId) throw new Error('備份檔的戰役 ID 與目前選擇的戰役不一致。');
  if (!isRow(value.tables)) throw new Error('備份檔缺少資料表內容。');
  const tables=value.tables;
  for (const name of Object.keys(tableColumns)) {
    const rows = tables[name];
    if (!Array.isArray(rows) || rows.length > 10000 || !rows.every(isRow)) throw new Error(`備份檔中的 ${name} 資料不完整。`);
    for (const row of rows) {
      if (name === 'campaigns') {
        if (row.id !== campaignId) throw new Error('備份檔包含不同的戰役資料。');
      } else if ('campaign_id' in row && row.campaign_id !== campaignId) {
        throw new Error(`備份檔中的 ${name} 含有其他戰役資料。`);
      }
      if (!tableColumns[name].every(column => column in row)) throw new Error(`備份檔中的 ${name} 欄位不完整。`);
    }
  }
  if (!Array.isArray(tables.campaigns) || tables.campaigns.length !== 1) throw new Error('備份檔必須包含一筆戰役資料。');
  if (!Array.isArray(value.adminActivityLogs) || !value.adminActivityLogs.every(isRow)) throw new Error('管理操作紀錄格式不正確。');
  return value as CampaignBackup;
}

function insertTableStatement(db: D1Database, table: string, rows: JsonRow[]) {
  const columns = tableColumns[table];
  const values = columns.map(column => `json_extract(value, '$.${column}')`).join(',');
  return db.prepare(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${values} FROM json_each(?)`).bind(JSON.stringify(rows));
}

export async function restoreCampaignBackup(db: D1Database, campaignId: string, input: unknown, admin: AdminSession) {
  const backup = validateBackup(input, campaignId);
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM admin_activity_logs WHERE entity_type='CAMPAIGN' AND entity_id=?").bind(campaignId),
    db.prepare('DELETE FROM auth_login_attempts WHERE campaign_id=?').bind(campaignId),
    db.prepare('DELETE FROM campaign_equipment_attachments WHERE equipment_instance_id IN (SELECT id FROM campaign_equipment_instances WHERE campaign_id=?) OR attachment_instance_id IN (SELECT id FROM campaign_equipment_instances WHERE campaign_id=?)').bind(campaignId,campaignId),
    db.prepare('DELETE FROM campaigns WHERE id=?').bind(campaignId),
  ];
  for (const table of Object.keys(tableColumns)) {
    const rows=backup.tables[table];
    if(rows.length)statements.push(insertTableStatement(db,table,rows));
  }
  if(backup.adminActivityLogs.length){
    statements.push(db.prepare(`
      INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id,before_json,after_json,created_at)
      SELECT u.id,
        json_extract(j.value,'$.action_type'),json_extract(j.value,'$.entity_type'),json_extract(j.value,'$.entity_id'),
        json_extract(j.value,'$.before_json'),json_extract(j.value,'$.after_json'),json_extract(j.value,'$.created_at')
      FROM json_each(?) j JOIN admin_users u ON u.username=json_extract(j.value,'$.admin_username')
    `).bind(JSON.stringify(backup.adminActivityLogs)));
  }
  statements.push(db.prepare(`
    INSERT INTO admin_activity_logs(admin_user_id,action_type,entity_type,entity_id,after_json)
    VALUES(?,'IMPORT_CAMPAIGN_BACKUP','CAMPAIGN',?,?)
  `).bind(admin.id,campaignId,JSON.stringify({schemaVersion:backup.schemaVersion,exportedAt:backup.exportedAt})));
  await db.batch(statements);
  return { campaignId, importedAt: new Date().toISOString(), restoredTables: Object.fromEntries(Object.entries(backup.tables).map(([name, rows]) => [name, rows.length])) };
}
