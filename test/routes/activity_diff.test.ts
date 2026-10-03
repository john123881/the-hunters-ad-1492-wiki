import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatActivityDiff } from '../../shared/activityDiff';

describe('Activity Diff Formatter (/shared/activityDiff.ts)', () => {
  it('當 before 與 after 均為空時回傳空陣列', () => {
    assert.deepEqual(formatActivityDiff(null, null), []);
  });

  it('當只有 after 時正確標記為 (新建)', () => {
    const diffs = formatActivityDiff(null, { sharedGold: 100, elapsedDays: 1 });
    assert.equal(diffs.length, 2);
    const goldDiff = diffs.find(d => d.field === 'sharedGold');
    assert.ok(goldDiff);
    assert.equal(goldDiff.label, '團隊金幣');
    assert.equal(goldDiff.displayBefore, '(新建)');
    assert.equal(goldDiff.displayAfter, '100');
  });

  it('當只有 before 時正確標記為 (已刪除)', () => {
    const diffs = formatActivityDiff({ storyCardCode: 'S01' }, null);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].label, '劇情卡代碼');
    assert.equal(diffs[0].displayBefore, 'S01');
    assert.equal(diffs[0].displayAfter, '(已刪除)');
  });

  it('能正確比對數值變更並略過未變更的欄位及 updatedAt', () => {
    const before = {
      sharedGold: 50,
      elapsedDays: 10,
      notes: '舊備註',
      updatedAt: '2026-10-01 10:00:00',
    };
    const after = {
      sharedGold: 100,
      elapsedDays: 10, // 未變更
      notes: '新備註',
      updatedAt: '2026-10-01 11:00:00', // 應被略過
    };

    const diffs = formatActivityDiff(before, after);
    assert.equal(diffs.length, 2);

    const goldDiff = diffs.find(d => d.field === 'sharedGold');
    assert.ok(goldDiff);
    assert.equal(goldDiff.displayBefore, '50');
    assert.equal(goldDiff.displayAfter, '100');

    const notesDiff = diffs.find(d => d.field === 'notes');
    assert.ok(notesDiff);
    assert.equal(notesDiff.displayBefore, '舊備註');
    assert.equal(notesDiff.displayAfter, '新備註');
  });

  it('支援布林值格式化為 是 / 否', () => {
    const before = { isRevealed: false };
    const after = { isRevealed: true };
    const diffs = formatActivityDiff(before, after);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].label, '翻牌狀態');
    assert.equal(diffs[0].displayBefore, '否');
    assert.equal(diffs[0].displayAfter, '是');
  });

  it('角色更新只比較雙方共有欄位，不把完整 before 的其他欄位誤判為刪除', () => {
    const before = {
      id: 8,
      campaignId: 'demo-hunters',
      playerNumber: 1,
      heroSlug: 'brawler',
      currentHealth: 6,
      version: 4,
      updatedAt: '2026-10-01 10:00:00',
    };
    const after = { heroSlug: 'brawler', currentHealth: 5 };

    const diffs = formatActivityDiff(before, after);

    assert.deepEqual(diffs.map(diff => diff.field), ['currentHealth']);
    assert.equal(diffs[0].displayBefore, '6');
    assert.equal(diffs[0].displayAfter, '5');
  });

  it('可用欄位別名比較舊新版地圖位置 Log', () => {
    const diffs = formatActivityDiff(
      { currentLocationType: 'MAP', currentLocationCode: 'M10' },
      { locationType: 'LOCATION', locationCode: 'L02' },
      {},
      { locationType: 'currentLocationType', locationCode: 'currentLocationCode' },
    );

    assert.deepEqual(diffs.map(diff => diff.field), ['currentLocationType', 'currentLocationCode']);
    assert.equal(diffs[0].label, '當前地點類型');
    assert.equal(diffs[1].displayAfter, 'L02');
  });

  it('摘要最多顯示 120 字，但保留完整原始值', () => {
    const longNote = '長'.repeat(180);
    const diffs = formatActivityDiff({ notes: '舊備註' }, { notes: longNote });

    assert.equal(diffs[0].displayAfter.length, 120);
    assert.match(diffs[0].displayAfter, /…$/);
    assert.equal(diffs[0].after, longNote);
  });

});
