import { describe, it, expect } from 'vitest';
import {
  CHARACTER_MAX_LEVEL,
  CURRENT_EXPANSION,
  MYTHIC_PLUS_SEASON,
} from '../constants';

describe('WoW constants', () => {
  it('CHARACTER_MAX_LEVEL is 90', () => {
    expect(CHARACTER_MAX_LEVEL).toBe(90);
  });

  it('CURRENT_EXPANSION is 11', () => {
    expect(CURRENT_EXPANSION).toBe(11);
  });

  it('MYTHIC_PLUS_SEASON is 15', () => {
    expect(MYTHIC_PLUS_SEASON).toBe(15);
  });
});
