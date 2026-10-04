import { describe, expect, it } from 'vitest';
import { speakerAdPositions } from '../src/lib/speaker-ad-positions';

describe('Sonia speaker advertising breaks', () => {
  const cases: Array<[number, number, number[]]> = [
    [45, 3, [14, 28, 45]],
    [50, 3, [14, 28, 50]],
    [29, 3, [14, 28, 29]],
    [28, 3, [14, 28, 28]],
    [14, 3, [14, 14, 14]],
    [1, 3, [1, 1, 1]],
    [0, 3, []],
    [45, 0, []],
    [45, 4, [14, 28, 45, 45]],
  ];
  it.each(cases)('places %i speakers and %i ads without dropping placements', (speakers, ads, expected) => {
    expect(speakerAdPositions(speakers, ads)).toEqual(expected);
  });
});
