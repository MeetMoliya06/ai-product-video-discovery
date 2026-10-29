import { describe, expect, it } from 'vitest';
import { captionOverlap, finalScore } from '../src/brain/scoreVideo.js';
import { heuristicAnalysis } from '../src/brain/analyzeProduct.js';
import { buildRounds } from '../src/pipeline/rounds.js';

describe('finalScore', () => {
  it('weights the visual verdict and adds at most 10 points of caption signal', () => {
    expect(finalScore(90, 0, true)).toBe(81);
    expect(finalScore(90, 1, true)).toBe(91);
    expect(finalScore(100, 1, true)).toBe(100);
  });
  it('never lets a "different product" verdict reach match territory', () => {
    expect(finalScore(95, 1, false)).toBe(59);
  });
  it('clamps to 0..100', () => {
    expect(finalScore(-20, 0, true)).toBe(0);
    expect(finalScore(500, 1, true)).toBe(100);
  });
});

describe('captionOverlap', () => {
  const a = { ...heuristicAnalysis({ title: 'Oversized skull graphic tee', description: '' }), colors: ['black'], textOnProduct: [] };
  it('is the share of product terms present in the caption', () => {
    expect(captionOverlap('love my oversized skull tee in black', a)).toBeGreaterThan(0.6);
    expect(captionOverlap('weekend vlog', a)).toBe(0);
  });
});

describe('buildRounds', () => {
  const a = heuristicAnalysis({ title: 'Protein dark chocolate bar', description: 'high protein snack' });
  it('produces maxRounds rounds and widens across them', () => {
    const r = buildRounds('instagram', a, 4);
    expect(r).toHaveLength(4);
    expect(r[0]).not.toEqual(r[1]);
    expect(buildRounds('meta', a, 3)).toHaveLength(3);
  });
});

describe('repeat searches rotate their query plan', () => {
  it('uses different terms on page 1 than on page 0 when the plan is long enough', () => {
    const a = { ...heuristicAnalysis({ title: 'Protein dark chocolate bar', description: '' }), instagram: { hashtags: ['a', 'b', 'c', 'd', 'e', 'f'] }, hashtags: [] };
    const page0 = buildRounds('instagram', a, 4).slice(0, 2);
    const page1 = buildRounds('instagram', a, 8).slice(2, 4);
    expect(page0.flat()).not.toEqual(page1.flat());
  });
});
