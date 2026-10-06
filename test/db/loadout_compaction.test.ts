import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planHandCompactionAfterReplacement } from '../../server/characterLoadoutMutations';

function emptyRetainedD1() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async all() { return { results: [] }; },
            async first() { return null; },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe('Equipment Board replacement compaction', () => {
  it('兩格手部裝備替換成一格後，下方裝備補到緊接的新位置', async () => {
    const loadout = {
      characterId: 9,
      heroSlug: 'cutthroat',
      openedSlotKeys: [],
      retainedAttachments: [],
      equipment: [
        {
          instanceId: 10, itemId: 100, categoryCode: 'weapon', slotCount: 2,
          slotKeys: ['HAND_1', 'HAND_2'],
        },
        {
          instanceId: 11, itemId: 101, categoryCode: 'shield', slotCount: 1,
          slotKeys: ['HAND_3'],
        },
      ],
    };
    const result = await planHandCompactionAfterReplacement(
      emptyRetainedD1(),
      loadout as never,
      10,
      ['HAND_1'],
      [],
    );
    assert.deepEqual(result.placements.get(11), ['HAND_2']);
  });

  it('替換後占格數相同時，下方裝備維持原位置', async () => {
    const loadout = {
      characterId: 9,
      heroSlug: 'cutthroat',
      openedSlotKeys: [],
      retainedAttachments: [],
      equipment: [
        {
          instanceId: 10, itemId: 100, categoryCode: 'weapon', slotCount: 2,
          slotKeys: ['HAND_1', 'HAND_2'],
        },
        {
          instanceId: 11, itemId: 101, categoryCode: 'shield', slotCount: 1,
          slotKeys: ['HAND_3'],
        },
      ],
    };
    const result = await planHandCompactionAfterReplacement(
      emptyRetainedD1(),
      loadout as never,
      10,
      ['HAND_1', 'HAND_2'],
      [],
    );
    assert.deepEqual(result.placements.get(11), ['HAND_3']);
  });
});
