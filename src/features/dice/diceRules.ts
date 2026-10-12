import { attackDie, travelDie } from './definitions';
import type { DiceResult } from './types';

export interface DiceResultPresentation {
  primary: string;
  outcome?: string;
  tone: 'critical' | 'miss' | 'event' | 'neutral';
}

export function presentDiceResult(result: DiceResult): DiceResultPresentation {
  if (result.dieType === attackDie.id) {
    if (result.value === 1) return { primary: '1', outcome: '爆擊', tone: 'critical' };
    if (result.value === 6) return { primary: '6', outcome: '攻擊miss', tone: 'miss' };
    return { primary: String(result.value ?? result.label), tone: 'neutral' };
  }

  if (result.dieType === travelDie.id) {
    if (result.faceId.startsWith('travel-flag')) {
      return { primary: '旗子', outcome: '觸發事件', tone: 'event' };
    }
    return { primary: '空白', tone: 'neutral' };
  }

  return { primary: String(result.value ?? result.label), tone: 'neutral' };
}

export function sortDiceResults(results: DiceResult[]): DiceResult[] {
  return [...results].sort((left, right) => {
    if (left.dieType !== attackDie.id || right.dieType !== attackDie.id) return 0;
    return (left.value ?? Number.MAX_SAFE_INTEGER) - (right.value ?? Number.MAX_SAFE_INTEGER);
  });
}

export function diceResultText(result: DiceResult): string {
  const presentation = presentDiceResult(result);
  return presentation.outcome
    ? `${presentation.primary} · ${presentation.outcome}`
    : presentation.primary;
}
