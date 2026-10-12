import type { DieDefinition } from './types';

export const attackDie: DieDefinition = {
  id: 'attack-die',
  name: '攻擊骰',
  shortName: '攻擊',
  faceCount: 6,
  maxCount: 8,
  colorLight: '#9b6845',
  colorDark: '#4b2b1d',
  inkColor: '#f2dfba',
  faces: [
    { id: 'attack-1', label: '1', value: 1 },
    { id: 'attack-2', label: '2', value: 2 },
    { id: 'attack-3', label: '3', value: 3 },
    { id: 'attack-4', label: '4', value: 4 },
    { id: 'attack-5', label: '5', value: 5 },
    { id: 'attack-swords', label: '⚔', value: 6 },
  ],
};

export const testDie: DieDefinition = {
  id: 'test-die',
  name: '檢定骰',
  shortName: '檢定',
  faceCount: 6,
  maxCount: 1,
  colorLight: '#e0b95f',
  colorDark: '#9b6d20',
  inkColor: '#24180b',
  faces: [
    { id: 'test-0', label: '0', value: 0 },
    { id: 'test-1a', label: '1', value: 1 },
    { id: 'test-1b', label: '1', value: 1 },
    { id: 'test-2a', label: '2', value: 2 },
    { id: 'test-2b', label: '2', value: 2 },
    { id: 'test-3', label: '3', value: 3 },
  ],
};

export const travelDie: DieDefinition = {
  id: 'travel-die',
  name: '旅行骰',
  shortName: '旅行',
  faceCount: 6,
  maxCount: 1,
  colorLight: '#738b32',
  colorDark: '#334615',
  inkColor: '#f1e8c8',
  faces: [
    { id: 'travel-flag-a', label: '⚑' },
    { id: 'travel-flag-b', label: '⚑' },
    { id: 'travel-blank-a', label: '' },
    { id: 'travel-blank-b', label: '' },
    { id: 'travel-blank-c', label: '' },
    { id: 'travel-blank-d', label: '' },
  ],
};

export const diceDefinitions = [attackDie, testDie, travelDie] as const;
