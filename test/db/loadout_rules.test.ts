import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EQUIPMENT_BOARD_SLOTS,
  HERO_SLOT_TEMPLATES,
  validateEquipmentBoardTemplates,
} from '../../shared/equipmentBoardTemplates';
import { canRestoreInitialSlotCovers, canToggleTenXpCover, resolvePlacementSlotKeys } from '../../server/loadoutRules';

describe('Equipment Board templates and placement rules', () => {
  it('九名英雄模板完整且共用槽位座標合法', () => {
    assert.equal(Object.keys(HERO_SLOT_TEMPLATES).length, 9);
    assert.equal(new Set(EQUIPMENT_BOARD_SLOTS.map(slot => slot.slotKey)).size, EQUIPMENT_BOARD_SLOTS.length);
    assert.deepEqual(validateEquipmentBoardTemplates(), []);
  });

  it('多格手部裝備向下占用且不能跨過 X 或 10 XP 格', () => {
    const opened = new Set<string>();
    const twoSlots = resolvePlacementSlotKeys({
      heroSlug: 'brawler', startSlotKey: 'HAND_1', categoryCode: 'weapon', slotCount: 2,
      openedSlotKeys: opened, occupancies: [],
    });
    assert.deepEqual(twoSlots, { ok: true, slotKeys: ['HAND_1', 'HAND_2'] });

    const locked = resolvePlacementSlotKeys({
      heroSlug: 'medic', startSlotKey: 'HAND_2', categoryCode: 'weapon', slotCount: 2,
      openedSlotKeys: opened, occupancies: [],
    });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.code, 'SLOT_LOCKED');
  });

  it('手部裝備不能跳過上方空格', () => {
    const result = resolvePlacementSlotKeys({
      heroSlug: 'cutthroat', startSlotKey: 'HAND_2', categoryCode: 'shield', slotCount: 1,
      openedSlotKeys: new Set(), occupancies: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'HAND_SLOT_GAP');
  });

  it('只有英雄原始 10 XP 格可切換，且有裝備時不能放回', () => {
    assert.equal(canToggleTenXpCover({ heroSlug: 'brawler', slotKey: 'HAND_4', occupancies: [] }).ok, true);
    const invalid = canToggleTenXpCover({ heroSlug: 'brawler', slotKey: 'HAND_3', occupancies: [] });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, 'NOT_TEN_XP_SLOT');
    const occupied = canToggleTenXpCover({
      heroSlug: 'brawler', slotKey: 'HAND_4',
      occupancies: [{ slotKey: 'HAND_4', equipmentInstanceId: 1, slotIndex: 1 }],
    });
    assert.equal(occupied.ok, false);
    if (!occupied.ok) assert.equal(occupied.code, 'SLOT_OCCUPIED');
  });
  it('附件不能作為主裝備獨立占用 ATTACHMENT 格', () => {
    const result = resolvePlacementSlotKeys({
      heroSlug: 'cutthroat',
      startSlotKey: 'ATTACHMENT_1',
      categoryCode: 'weapon_attachment',
      slotCount: 1,
      openedSlotKeys: new Set(),
      occupancies: [],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'ATTACHMENT_REQUIRES_SOCKET');
  });

  it('復原初始面板時會阻擋已被裝備占用的 10 XP 格', () => {
    assert.equal(canRestoreInitialSlotCovers({
      openedSlotKeys: ['HAND_4', 'ACCESSORY_2'], occupancies: [],
    }).ok, true);
    const occupied = canRestoreInitialSlotCovers({
      openedSlotKeys: ['HAND_4', 'ACCESSORY_2'],
      occupancies: [{ slotKey: 'HAND_4', equipmentInstanceId: 7, slotIndex: 1 }],
    });
    assert.equal(occupied.ok, false);
    if (!occupied.ok) {
      assert.equal(occupied.code, 'SLOT_OCCUPIED');
      assert.deepEqual(occupied.conflictingSlotKeys, ['HAND_4']);
    }
  });


});
