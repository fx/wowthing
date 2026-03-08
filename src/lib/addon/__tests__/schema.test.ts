import { describe, expect, it } from 'vitest';
import { uploadSchema } from '../schema';

describe('uploadSchema', () => {
  it('parses a minimal upload', () => {
    const input = {
      version: 1,
      battleTag: 'Player#1234',
      chars: {},
    };
    const result = uploadSchema.parse(input);
    expect(result.version).toBe(1);
    expect(result.battleTag).toBe('Player#1234');
    expect(result.chars).toEqual({});
  });

  it('parses character with currencies', () => {
    const input = {
      version: 1,
      battleTag: 'Player#1234',
      chars: {
        '12345': {
          level: 90,
          currencies: {
            '3383': '50:0:1:50:100:0:500',
          },
        },
      },
    };
    const result = uploadSchema.parse(input);
    const char = result.chars['12345'];
    expect(char.level).toBe(90);

    const currency = char.currencies!['3383'];
    expect(currency.quantity).toBe(50);
    expect(currency.max).toBe(0);
    expect(currency.isWeekly).toBe(true);
    expect(currency.weekQuantity).toBe(50);
    expect(currency.weekMax).toBe(100);
    expect(currency.isMovingMax).toBe(false);
    expect(currency.totalQuantity).toBe(500);
  });

  it('parses currency with zeros and missing fields', () => {
    const input = {
      version: 1,
      battleTag: 'Test#0001',
      chars: {
        '1': {
          currencies: {
            '100': '0:0:0:0:0:0:0',
          },
        },
      },
    };
    const result = uploadSchema.parse(input);
    const currency = result.chars['1'].currencies!['100'];
    expect(currency.quantity).toBe(0);
    expect(currency.isWeekly).toBe(false);
    expect(currency.isMovingMax).toBe(false);
  });

  it('parses progress quests with objectives', () => {
    const input = {
      version: 1,
      battleTag: 'Player#1234',
      chars: {
        '12345': {
          progressQuests: [
            'special-1|99001|Special Assignment: Undermine|1|1710000000|progress~Kill mobs~3~10^collect~Gather items~5~5',
          ],
        },
      },
    };
    const result = uploadSchema.parse(input);
    const quest = result.chars['12345'].progressQuests![0];
    expect(quest.key).toBe('special-1');
    expect(quest.questId).toBe(99001);
    expect(quest.name).toBe('Special Assignment: Undermine');
    expect(quest.status).toBe(1);
    expect(quest.objectives).toHaveLength(2);
    expect(quest.objectives[0]).toEqual({
      type: 'progress',
      text: 'Kill mobs',
      have: 3,
      need: 10,
    });
    expect(quest.objectives[1]).toEqual({
      type: 'collect',
      text: 'Gather items',
      have: 5,
      need: 5,
    });
  });

  it('parses progress quests without objectives', () => {
    const input = {
      version: 1,
      battleTag: 'Player#1234',
      chars: {
        '12345': {
          progressQuests: ['key1|50000|Some Quest|2|0'],
        },
      },
    };
    const result = uploadSchema.parse(input);
    const quest = result.chars['12345'].progressQuests![0];
    expect(quest.objectives).toEqual([]);
    expect(quest.status).toBe(2);
  });

  it('parses lockouts', () => {
    const input = {
      version: 1,
      battleTag: 'Player#1234',
      chars: {
        '12345': {
          lockouts: [
            {
              id: 16340,
              name: 'Voidspire',
              difficulty: 15,
              maxBosses: 6,
              defeatedBosses: 3,
              locked: true,
              resetTime: 1710000000,
              bosses: ['Boss1', 'Boss2', 'Boss3'],
            },
          ],
        },
      },
    };
    const result = uploadSchema.parse(input);
    const lockout = result.chars['12345'].lockouts![0];
    expect(lockout.id).toBe(16340);
    expect(lockout.difficulty).toBe(15);
    expect(lockout.defeatedBosses).toBe(3);
    expect(lockout.bosses).toEqual(['Boss1', 'Boss2', 'Boss3']);
  });

  it('parses full character data', () => {
    const input = {
      version: 1,
      battleTag: 'Player#1234',
      chars: {
        '12345': {
          level: 90,
          copper: 1500000,
          keystoneInstance: 375,
          keystoneLevel: 12,
          dailyReset: 1710000000,
          weeklyReset: 1710500000,
          currencies: {
            '3383': '50:0:1:50:100:0:500',
          },
          dailyQuests: [80000, 80001],
          otherQuests: [90000],
          vault: {
            t1: [[10, 4, 8, 616]],
            t3: [[15, 2, 6, 620]],
          },
          scanTimes: { currencies: 1710000000 },
        },
      },
    };
    const result = uploadSchema.parse(input);
    const char = result.chars['12345'];
    expect(char.copper).toBe(1500000);
    expect(char.keystoneInstance).toBe(375);
    expect(char.keystoneLevel).toBe(12);
    expect(char.dailyQuests).toEqual([80000, 80001]);
    expect(char.otherQuests).toEqual([90000]);
    expect(char.vault!['t1']).toHaveLength(1);
  });

  it('rejects invalid uploads', () => {
    expect(() => uploadSchema.parse({})).toThrow();
    expect(() => uploadSchema.parse({ version: 'abc' })).toThrow();
    expect(() =>
      uploadSchema.parse({ version: 1, chars: 'not-an-object' }),
    ).toThrow();
  });
});
