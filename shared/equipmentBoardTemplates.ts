export type CharacterSlotCategory =
  | 'ATTACHMENT'
  | 'HAND'
  | 'HEAD'
  | 'ARMOR'
  | 'ACCESSORY'
  | 'POUCH';

export type CharacterSlotInitialStatus = 'OPEN' | 'LOCKED_10' | 'BLOCKED';

export interface EquipmentBoardSlotTemplate {
  slotKey: string;
  category: CharacterSlotCategory;
  laneKey: string;
  rowIndex: number;
  boardRect: {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  };
}

export interface HeroSlotTemplate {
  heroSlug: string;
  templateVersion: number;
  verified: boolean;
  initialStatusBySlotKey: Readonly<Record<string, CharacterSlotInitialStatus>>;
}

const lane = (
  prefix: string,
  category: CharacterSlotCategory,
  laneKey: string,
  xPercent: number,
  yPercent: number,
  widthPercent: number,
  heightPercent: number,
  count: number,
): EquipmentBoardSlotTemplate[] =>
  Array.from({ length: count }, (_, index) => ({
    slotKey: `${prefix}_${index + 1}`,
    category,
    laneKey,
    rowIndex: index + 1,
    boardRect: {
      xPercent,
      yPercent: yPercent + heightPercent * index,
      widthPercent,
      heightPercent,
    },
  }));

export const EQUIPMENT_BOARD_SLOT_SIZE = {
  widthPercent: 16.5,
  heightPercent: 19.9,
} as const;

/** 手部卡圖的視覺延伸量；讓武器左側 socket 凸耳伸入附件／符文欄。 */
export const HAND_EQUIPMENT_VISUAL = {
  socketOverhangPercent: 2.2,
  socketOverlayWidthPercent: 18,
  socketOverlayHeightRatio: 0.46,
} as const;

const { widthPercent: slotWidth, heightPercent: slotHeight } = EQUIPMENT_BOARD_SLOT_SIZE;

export const EQUIPMENT_BOARD_SLOTS: readonly EquipmentBoardSlotTemplate[] = [
  // CSS 以寬度維持 1:1；高度百分比負責縱向排列與多格裝備占位。
  ...lane('ATTACHMENT', 'ATTACHMENT', 'ATTACHMENT', 2.5, 7.5, slotWidth, slotHeight, 4),
  ...lane('HAND', 'HAND', 'HAND', 18.9, 7.5, slotWidth, slotHeight, 4),
  ...lane('HEAD', 'HEAD', 'HEAD', 48.5, 7.5, slotWidth, slotHeight, 1),
  ...lane('ARMOR', 'ARMOR', 'ARMOR', 39.5, 27.5, slotWidth, slotHeight, 2),
  ...lane('ACCESSORY', 'ACCESSORY', 'ACCESSORY', 56.5, 27.5, slotWidth, slotHeight, 2),
  ...lane('POUCH', 'POUCH', 'POUCH', 80.0, 7.5, slotWidth, slotHeight, 4),
] as const;

const slotKeys = EQUIPMENT_BOARD_SLOTS.map(slot => slot.slotKey);
const statuses = (
  locked10: readonly string[] = [],
  blocked: readonly string[] = [],
): Readonly<Record<string, CharacterSlotInitialStatus>> =>
  Object.fromEntries(slotKeys.map(slotKey => [
    slotKey,
    blocked.includes(slotKey) ? 'BLOCKED' : locked10.includes(slotKey) ? 'LOCKED_10' : 'OPEN',
  ]));

export const HERO_SLOT_TEMPLATES: Readonly<Record<string, HeroSlotTemplate>> = {
  brawler: {
    heroSlug: 'brawler', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ATTACHMENT_4', 'HAND_4', 'ACCESSORY_2']),
  },
  crossbowman: {
    heroSlug: 'crossbowman', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ATTACHMENT_4', 'HAND_4', 'ACCESSORY_2', 'POUCH_4']),
  },
  cutthroat: {
    heroSlug: 'cutthroat', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['POUCH_4']),
  },
  huntress: {
    heroSlug: 'huntress', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ATTACHMENT_4', 'HAND_4', 'ACCESSORY_2']),
  },
  landsknecht: {
    heroSlug: 'landsknecht', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ACCESSORY_1', 'POUCH_3'], ['ACCESSORY_2', 'POUCH_4']),
  },
  'man-at-arms': {
    heroSlug: 'man-at-arms', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ACCESSORY_2', 'POUCH_4']),
  },
  medic: {
    heroSlug: 'medic', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ATTACHMENT_3', 'HAND_3'], ['ATTACHMENT_4', 'HAND_4']),
  },
  sorceress: {
    heroSlug: 'sorceress', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ATTACHMENT_3', 'HAND_3', 'POUCH_4'], ['ATTACHMENT_4', 'HAND_4']),
  },
  witch: {
    heroSlug: 'witch', templateVersion: 1, verified: true,
    initialStatusBySlotKey: statuses(['ATTACHMENT_3', 'HAND_3', 'ACCESSORY_2'], ['ATTACHMENT_4', 'HAND_4']),
  },
};

export const CATEGORY_ITEM_CODES: Readonly<Record<CharacterSlotCategory, readonly string[]>> = {
  ATTACHMENT: ['weapon_attachment'],
  HAND: ['weapon', 'shield'],
  HEAD: ['helmet'],
  ARMOR: ['armor'],
  ACCESSORY: ['accessory'],
  POUCH: ['utility', 'consumable', 'trap', 'grenade'],
};

export function getEquipmentBoardSlot(slotKey: string) {
  return EQUIPMENT_BOARD_SLOTS.find(slot => slot.slotKey === slotKey) ?? null;
}

export function getHeroSlotTemplate(heroSlug: string) {
  return HERO_SLOT_TEMPLATES[heroSlug] ?? null;
}

export function validateEquipmentBoardTemplates(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const slot of EQUIPMENT_BOARD_SLOTS) {
    if (seen.has(slot.slotKey)) errors.push(`重複 slotKey：${slot.slotKey}`);
    seen.add(slot.slotKey);
    const rect = slot.boardRect;
    if (
      rect.xPercent < 0 || rect.yPercent < 0 ||
      rect.widthPercent <= 0 || rect.heightPercent <= 0 ||
      rect.xPercent + rect.widthPercent > 100 ||
      rect.yPercent + rect.heightPercent > 100
    ) errors.push(`槽位座標超出範圍：${slot.slotKey}`);
  }
  for (const [heroSlug, template] of Object.entries(HERO_SLOT_TEMPLATES)) {
    if (template.heroSlug !== heroSlug) errors.push(`英雄 slug 不一致：${heroSlug}`);
    const keys = Object.keys(template.initialStatusBySlotKey);
    for (const slotKey of slotKeys) if (!(slotKey in template.initialStatusBySlotKey)) errors.push(`${heroSlug} 缺少 ${slotKey}`);
    for (const slotKey of keys) if (!seen.has(slotKey)) errors.push(`${heroSlug} 多出 ${slotKey}`);
  }
  return errors;
}
