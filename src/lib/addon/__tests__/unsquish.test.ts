import { describe, expect, it } from 'vitest';
import { unsquish } from '../unsquish';

describe('unsquish', () => {
  it('decodes a single segment with no deltas', () => {
    const result = unsquish('100');
    expect(result).toEqual(new Set([100]));
  });

  it('decodes a single segment with deltas', () => {
    // A=1, B=2, C=3
    const result = unsquish('100.ABC');
    expect(result).toEqual(new Set([100, 101, 103, 106]));
  });

  it('decodes multiple segments', () => {
    // First segment: 100, 100+1=101
    // Second segment: 500, 500+2=502
    const result = unsquish('100.A|500.B');
    expect(result).toEqual(new Set([100, 101, 500, 502]));
  });

  it('handles segments with just start ID (gap > 88)', () => {
    const result = unsquish('100.A|300|400.B');
    // 100, 101, 300, 400, 402
    expect(result).toEqual(new Set([100, 101, 300, 400, 402]));
  });

  it('returns empty set for empty string', () => {
    expect(unsquish('')).toEqual(new Set());
  });

  it('decodes alphabet correctly — Z=26, a=27, z=52, 0=53', () => {
    // Z = 26: 100 + 26 = 126
    const r1 = unsquish('100.Z');
    expect(r1.has(126)).toBe(true);

    // a = 27: 100 + 27 = 127
    const r2 = unsquish('100.a');
    expect(r2.has(127)).toBe(true);

    // z = 52: 100 + 52 = 152
    const r3 = unsquish('100.z');
    expect(r3.has(152)).toBe(true);

    // 0 = 53: 100 + 53 = 153
    const r4 = unsquish('100.0');
    expect(r4.has(153)).toBe(true);
  });
});
