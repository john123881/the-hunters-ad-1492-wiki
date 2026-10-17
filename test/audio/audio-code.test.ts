import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyAudioCode, normalizeAudioCode } from '../../shared/audio';

describe('audio code normalization', () => {
  it('normalizes case, whitespace and common separators', () => {
    assert.equal(normalizeAudioCode(' q 1 '), 'Q1');
    assert.equal(normalizeAudioCode('vw-2'), 'VW2');
    assert.equal(normalizeAudioCode('lw．8'), 'LW8');
    assert.equal(normalizeAudioCode('37.22'), '3722');
    assert.equal(normalizeAudioCode(' f-001 '), 'F001');
  });

  it('keeps supported branch suffixes', () => {
    assert.equal(normalizeAudioCode('v27a'), 'V27A');
    assert.equal(normalizeAudioCode('V32A1'), 'V32A1');
    assert.equal(normalizeAudioCode('009a'), '009A');
  });

  it('rejects empty and unsupported codes', () => {
    assert.equal(normalizeAudioCode(''), null);
    assert.equal(normalizeAudioCode('HQ1'), null);
    assert.equal(normalizeAudioCode('Q'), null);
    assert.equal(normalizeAudioCode('37/22'), null);
  });
});

describe('audio code classification', () => {
  it('checks compound prefixes before single-letter prefixes', () => {
    assert.deepEqual(classifyAudioCode('VW1'), { code: 'VW1', category: 'w_quest_win' });
    assert.deepEqual(classifyAudioCode('LW2'), { code: 'LW2', category: 'w_quest_loss' });
  });

  it('classifies every supported audio family', () => {
    assert.equal(classifyAudioCode('Q1')?.category, 'quest');
    assert.equal(classifyAudioCode('V1')?.category, 'quest_win');
    assert.equal(classifyAudioCode('L1')?.category, 'quest_loss');
    assert.equal(classifyAudioCode('W2')?.category, 'w_quest');
    assert.equal(classifyAudioCode('F001')?.category, 'character');
    assert.equal(classifyAudioCode('37.22')?.category, 'story');
  });
});
