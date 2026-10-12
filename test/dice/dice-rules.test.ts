import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diceResultText, presentDiceResult, sortDiceResults } from '../../src/features/dice/diceRules';
import { testDie } from '../../src/features/dice/definitions';
import type { DiceResult } from '../../src/features/dice/types';

const result = (dieType: string, faceId: string, label: string, value?: number): DiceResult => ({
  dieId: `${dieType}-${faceId}`,
  dieType,
  dieName: dieType,
  faceId,
  label,
  value,
});

describe('Dice result rules', () => {
  it('sorts attack dice from 1 through 6 and labels critical and miss', () => {
    const sorted = sortDiceResults([
      result('attack-die', 'attack-swords', '⚔', 6),
      result('attack-die', 'attack-3', '3', 3),
      result('attack-die', 'attack-1', '1', 1),
    ]);
    assert.deepEqual(sorted.map(entry => entry.value), [1, 3, 6]);
    assert.equal(diceResultText(sorted[0]), '1 · 爆擊');
    assert.equal(diceResultText(sorted[2]), '6 · 攻擊miss');
  });

  it('labels travel flags as events and keeps blank faces blank', () => {
    assert.deepEqual(
      presentDiceResult(result('travel-die', 'travel-flag-a', '⚑')),
      { primary: '旗子', outcome: '觸發事件', tone: 'event' },
    );
    assert.equal(diceResultText(result('travel-die', 'travel-blank-a', '空白')), '空白');
  });

  it('shows test die values directly with faces 0, 1, 1, 2, 2, 3', () => {
    assert.deepEqual(testDie.faces.map(face => face.value), [0, 1, 1, 2, 2, 3]);
    assert.equal(diceResultText(result('test-die', 'test-0', '0', 0)), '0');
    assert.equal(diceResultText(result('test-die', 'test-3', '3', 3)), '3');
  });
});
