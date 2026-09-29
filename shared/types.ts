export const categoryCodes = ['weapon', 'shield', 'weapon_attachment', 'helmet', 'armor', 'accessory', 'utility', 'consumable', 'trap', 'grenade', 'material'] as const;
export type CategoryCode = (typeof categoryCodes)[number];
// consumed_after_combat 與 once_per_combat 是早期 schema 的相容代碼；規則書正式語意皆以 quest（任務）為單位。
export const consumptionLabels = { permanent: '永久保留', consumed_on_use: '使用後消耗', consumed_after_combat: '任務結束後消耗' } as const;
export const usageLabels = { unlimited: '不限次數', single_use: '單次使用', once_per_combat: '每個任務一次' } as const;
export const attackLabels = { melee: '近戰', physical_ranged: '物理遠程', magic: '魔法', trap: '陷阱' } as const;
export const attributeLabels = { strength: '力量', agility: '敏捷', wisdom: '智慧', insight: '洞察' } as const;
export const actionLabels = { damage: '傷害', control: '控制', healing: '治療', defense: '防禦', other: '其他判定' } as const;
export const resolutionLabels = { normal_attack: '一般攻擊', dice_check: '擲骰判定', automatic: '自動生效' } as const;
export const targetLabels: Record<string, string> = { self: '自身', weapon: '武器', attack: '本次攻擊', ally: '同伴', enemy: '敵人', area: '區域' };
export const timingLabels: Record<string, string> = { passive: '被動', on_use: '使用時', on_attack: '攻擊時', on_action_success: '判定成功時' };
export const durationLabels: Record<string, string> = { instant: '立即', this_attack: '本次攻擊', combat: '本場戰鬥', quest: '本次任務', while_equipped: '裝備期間', while_installed: '安裝期間', permanent: '永久' };
export const operationLabels: Record<string, string> = { add: '增加', subtract: '減少', set: '設為', apply: '施加', reroll: '重擲' };
export type ConsumptionType = keyof typeof consumptionLabels;
export type UsageLimitType = keyof typeof usageLabels;
export type AttackType = keyof typeof attackLabels;
export type AttributeCode = keyof typeof attributeLabels;

export interface Lookup { code: string; name: string }
export interface CraftingResource {
  code: string; slug: string; name: string; originalName: string;
  categoryCode: 'material' | 'plant' | 'trophy';
  imageUrl: string; imageAlt: string; quantity: number; sortOrder: number;
}
export interface CraftingStationRequirement {
  code: string; name: string; originalName: string; imageUrl: string;
  requiredLevel: number; sortOrder: number;
}
export interface CraftingRecipe {
  id: number; outputQuantity: number; description: string | null;
  resources: CraftingResource[]; stations: CraftingStationRequirement[];
}
export interface ItemSummary {
  id: number; code: string; slug: string; cardNumber: string | null; name: string;
  categoryCode: CategoryCode; categoryName: string; slotCount: number;
  consumptionType: ConsumptionType | null; usageLimitType: UsageLimitType | null;
  description: string; imageUrl: string; imageAlt: string;
  sourceKind: 'demo' | 'reference' | 'official';
  crafting: CraftingRecipe | null;
}
export interface ItemReference { id: number; slug: string; code: string; name: string; cardNumber: string | null }
export interface ActionMode {
  id: number; actionType: keyof typeof actionLabels; attackType: AttackType | null;
  resolutionMethod: keyof typeof resolutionLabels;
  valueSource: 'character_attribute' | 'fixed' | 'action_card' | 'none';
  attributeCode: AttributeCode | null; fixedValue: number | null; diceCount: number | null;
  checkModifier: number; rangeType: 'fixed' | 'action_card' | 'none';
  rangeMin: number | null; rangeMax: number | null; targetAttributeCode: string | null;
  comparisonOperator: string | null; description: string; displayOrder: number;
}
export interface ItemEffect {
  id: number; code: string; name: string; actionModeId: number | null;
  targetType: string; numericValue: number | null; operation: string;
  triggerTiming: string; durationType: string; isNegative: boolean; description: string;
}
export interface Connector { code: string; name: string; shapeDescription: string | null }
export interface ItemDetail extends ItemSummary {
  originalName: string; originalEffectText: string; sourceReference: string | null; sourceNote: string;
  languageCode: string; editionCode: string | null; slotZone: string | null;
  actionModes: ActionMode[];
  defense: { meleeDefense: number; rangedDefense: number; magicDefense: number } | null;
  shieldRules: { attributeCode: 'strength' | 'agility'; fixedValue: number; diceCount: number }[];
  traits: { code: string; numericValue: number | null; description: string | null }[];
  sockets: (Connector & { slotIndex: number; socketIndex: number })[];
  attachment: Connector | null; effects: ItemEffect[];
}
export interface ItemsResponse { data: ItemSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface CatalogResponse {
  data: {
    total: number; demoCount: number;
    categories: (Lookup & { count: number })[];
    connectors: Lookup[]; effects: Lookup[]; traits: Lookup[];
  };
}
export interface DetailResponse { data: ItemDetail }
export interface ApiErrorResponse { error: { code: string; message: string } }

export interface CampaignPlayerSeat { playerNumber: number; playerAlias: string }
export interface AuthSession {
  campaignId: string;
  campaignName: string;
  playerNumber: number;
  playerAlias: string;
  isActive: boolean;
  expiresAt: string;
  players: CampaignPlayerSeat[];
}
export interface AuthSessionResponse { data: AuthSession | null }

export interface WagonUpgrade {
  code: string;
  name: string;
  originalName: string;
  imageUrl: string;
  sortOrder: number;
  level: number;
}
export interface WagonTimeToken {
  id: number;
  tokenCode: 'A' | 'B' | 'C' | 'D';
  placedAtDay: number;
  unlockAtDay: number;
  storyCardCode: string;
}
export interface WagonResource {
  code: string;
  name: string;
  imageUrl: string;
  quantity: number;
}
export interface WagonEquipmentInstance {
  id: number; itemId: number; code: string; slug: string;
  cardNumber: string | null; name: string; imageUrl: string;
  categoryName: string; damageable: boolean; damageMarkers: number; notes: string;
}
export interface CampaignWagon {
  campaignId: string;
  campaignName: string;
  elapsedDays: number;
  locationCode: string;
  sharedGold: number;
  notes: string;
  version: number;
  upgrades: WagonUpgrade[];
  timeTokens: WagonTimeToken[];
  availableStoryCardCodes: string[];
  resources: WagonResource[];
  equipment: WagonEquipmentInstance[];
}
export interface CampaignWagonResponse { data: CampaignWagon }

export interface CampaignMapTile {
  mapCode: string;
  rowIndex: number;
  columnIndex: number;
  isRevealed: boolean;
  face: 'FRONT' | 'BACK';
  resourceNotes: string;
  notes: string;
}
export interface CampaignLocationCard {
  locationCode: string;
  isRevealed: boolean;
  face: 'FRONT' | 'BACK';
  resourceNotes: string;
  notes: string;
}
export interface CampaignMapCard {
  id: number;
  cardCode: string;
  cardType: 'STORY' | 'MISSION' | 'FEATURE';
  status: 'PENDING' | 'RESOLVED';
  locationType: 'MAP' | 'LOCATION';
  locationCode: string;
  notes: string;
  isInTownDeck: boolean;
  timeToken: { tokenCode: 'A' | 'B' | 'C' | 'D'; unlockAtDay: number | null } | null;
}
export interface CampaignMap {
  campaignId: string;
  version: number;
  currentLocationType: 'MAP' | 'LOCATION' | null;
  currentLocationCode: string | null;
  currentMapCode: string | null;
  roadEventNotes: string;
  townEventNotes: string;
  tiles: CampaignMapTile[];
  locations: CampaignLocationCard[];
  cards: CampaignMapCard[];
  cardProgress: CampaignCardProgress[];
}

export interface CampaignCardProgress {
  cardCode: string;
  cardType: 'STORY' | 'MISSION';
  edition: 'CORE' | 'EXPANSION';
  isResolved: boolean;
  locationType: 'MAP' | 'LOCATION' | null;
  locationCode: string | null;
  timeToken: { tokenCode: 'A' | 'B' | 'C' | 'D'; unlockAtDay: number | null } | null;
}

export interface CampaignMapResponse { data: CampaignMap }

export interface CampaignCharacter {
  id: number;
  playerNumber: number;
  heroSlug: string;
  customName: string;
  moralePosition: number;
  strengthLevel: number;
  knowledgeLevel: number;
  perceptionLevel: number;
  agilityLevel: number;
  maxHealthLevel: number;
  currentHealth: number;
  xpTens: number;
  xpOnes: number;
  isPoisoned: boolean;
  notes: string;
  version: number;
}
export interface CampaignCharactersResponse { data: { characters: CampaignCharacter[] } }
