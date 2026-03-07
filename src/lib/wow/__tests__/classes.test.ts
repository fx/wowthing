import { describe, it, expect } from 'vitest';
import { CLASS_COLORS } from '../classes';

describe('CLASS_COLORS', () => {
  it('has all 13 WoW classes', () => {
    expect(Object.keys(CLASS_COLORS)).toHaveLength(13);
  });

  it('has correct IDs from 1 to 13', () => {
    for (let i = 1; i <= 13; i++) {
      expect(CLASS_COLORS[i]).toBeDefined();
    }
  });

  it('has correct Warrior color', () => {
    expect(CLASS_COLORS[1]).toEqual({ name: 'Warrior', color: '#C79C6E' });
  });

  it('has correct Death Knight color', () => {
    expect(CLASS_COLORS[6]).toEqual({
      name: 'Death Knight',
      color: '#C41E3A',
    });
  });

  it('has correct Evoker color', () => {
    expect(CLASS_COLORS[13]).toEqual({ name: 'Evoker', color: '#33937F' });
  });

  it('every entry has name and color fields', () => {
    for (const [, entry] of Object.entries(CLASS_COLORS)) {
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('color');
      expect(entry.color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
