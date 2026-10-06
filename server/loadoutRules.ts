import {
  CATEGORY_ITEM_CODES,
  EQUIPMENT_BOARD_SLOTS,
  getEquipmentBoardSlot,
  getHeroSlotTemplate,
  type CharacterSlotInitialStatus,
} from '../shared/equipmentBoardTemplates';

export type EffectiveSlotStatus = CharacterSlotInitialStatus | 'OCCUPIED';

export interface SlotOccupancy {
  slotKey: string;
  equipmentInstanceId: number;
  slotIndex: number;
}

export function getEffectiveSlotStatus(
  heroSlug: string,
  slotKey: string,
  openedSlotKeys: ReadonlySet<string>,
  occupiedSlotKeys: ReadonlySet<string>,
): EffectiveSlotStatus | null {
  const template = getHeroSlotTemplate(heroSlug);
  const initial = template?.initialStatusBySlotKey[slotKey];
  if (!template?.verified || !initial) return null;
  if (occupiedSlotKeys.has(slotKey)) return 'OCCUPIED';
  if (initial === 'LOCKED_10' && openedSlotKeys.has(slotKey)) return 'OPEN';
  return initial;
}

export function resolvePlacementSlotKeys(params: {
  heroSlug: string;
  startSlotKey: string;
  categoryCode: string;
  slotCount: number;
  openedSlotKeys: ReadonlySet<string>;
  occupancies: readonly SlotOccupancy[];
  ignoreEquipmentInstanceId?: number;
}) {
  const template = getHeroSlotTemplate(params.heroSlug);
  if (!template?.verified) return { ok: false as const, code: 'SLOT_TEMPLATE_INCOMPLETE', message: '這位英雄的裝備格配置尚未完成。' };
  const start = getEquipmentBoardSlot(params.startSlotKey);
  if (!start) return { ok: false as const, code: 'INVALID_SLOT', message: '找不到這個裝備格。' };
  if (start.category === 'ATTACHMENT') {
    return { ok: false as const, code: 'ATTACHMENT_REQUIRES_SOCKET', message: '附件必須安裝在同列武器的相容孔位，不能獨立占用裝備格。' };
  }
  if (!CATEGORY_ITEM_CODES[start.category].includes(params.categoryCode)) {
    return { ok: false as const, code: 'INVALID_SLOT_CATEGORY', message: '這件物品不能放在此類裝備格。' };
  }
  if (!Number.isInteger(params.slotCount) || params.slotCount < 1) {
    return { ok: false as const, code: 'INVALID_SLOT_COUNT', message: '物品占用格數不正確。' };
  }
  const laneSlots = EQUIPMENT_BOARD_SLOTS
    .filter(slot => slot.laneKey === start.laneKey)
    .sort((a, b) => a.rowIndex - b.rowIndex);
  const startIndex = laneSlots.findIndex(slot => slot.slotKey === start.slotKey);
  const targets = laneSlots.slice(startIndex, startIndex + params.slotCount);
  if (targets.length !== params.slotCount) {
    return { ok: false as const, code: 'SLOT_OVERFLOW', message: '剩餘格數不足，無法放置這件物品。' };
  }
  const occupied = new Map(
    params.occupancies
      .filter(row => row.equipmentInstanceId !== params.ignoreEquipmentInstanceId)
      .map(row => [row.slotKey, row.equipmentInstanceId]),
  );
  for (const target of targets) {
    const status = getEffectiveSlotStatus(
      params.heroSlug,
      target.slotKey,
      params.openedSlotKeys,
      new Set(occupied.keys()),
    );
    if (status === 'BLOCKED') return { ok: false as const, code: 'SLOT_BLOCKED', message: '放置範圍包含固定 X 格。' };
    if (status === 'LOCKED_10') return { ok: false as const, code: 'SLOT_LOCKED', message: '請先開啟 10 XP 蓋板。' };
    if (status === 'OCCUPIED') return { ok: false as const, code: 'SLOT_OCCUPIED', message: '放置範圍已有其他物品。' };
  }
  if (start.category === 'HAND') {
    const earlier = laneSlots.slice(0, startIndex);
    const firstEmptyBefore = earlier.find(slot => {
      const status = getEffectiveSlotStatus(params.heroSlug, slot.slotKey, params.openedSlotKeys, new Set(occupied.keys()));
      return status === 'OPEN';
    });
    if (firstEmptyBefore) {
      return { ok: false as const, code: 'HAND_SLOT_GAP', message: '手部裝備必須從最上方開始緊密排列。' };
    }
  }
  return { ok: true as const, slotKeys: targets.map(slot => slot.slotKey) };
}

export function canRestoreInitialSlotCovers(params: {
  openedSlotKeys: readonly string[];
  occupancies: readonly SlotOccupancy[];
}) {
  const occupiedSlotKeys = new Set(params.occupancies.map(row => row.slotKey));
  const conflictingSlotKeys = params.openedSlotKeys.filter(slotKey => occupiedSlotKeys.has(slotKey));
  if (conflictingSlotKeys.length) {
    return {
      ok: false as const,
      code: 'SLOT_OCCUPIED',
      message: `以下格子已有裝備，不能復原初始蓋板：${conflictingSlotKeys.join('、')}`,
      conflictingSlotKeys,
    };
  }
  return { ok: true as const };
}

export function canToggleTenXpCover(params: {
  heroSlug: string;
  slotKey: string;
  occupancies: readonly SlotOccupancy[];
}) {
  const template = getHeroSlotTemplate(params.heroSlug);
  if (!template?.verified) return { ok: false as const, code: 'SLOT_TEMPLATE_INCOMPLETE', message: '這位英雄的裝備格配置尚未完成。' };
  if (template.initialStatusBySlotKey[params.slotKey] !== 'LOCKED_10') {
    return { ok: false as const, code: 'NOT_TEN_XP_SLOT', message: '這個位置不是此英雄原本的 10 XP 格。' };
  }
  if (params.occupancies.some(row => row.slotKey === params.slotKey)) {
    return { ok: false as const, code: 'SLOT_OCCUPIED', message: '此格已有裝備，不能放回 10 XP 蓋板。' };
  }
  return { ok: true as const };
}
