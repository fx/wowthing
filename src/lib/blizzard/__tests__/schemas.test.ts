import { describe, it, expect } from 'vitest';
import {
  userProfileSchema,
  characterProfileSchema,
  completedQuestsSchema,
  reputationsSchema,
} from '../schemas';

describe('userProfileSchema', () => {
  it('parses a valid user profile response', () => {
    const input = {
      wow_accounts: [
        {
          id: 12345,
          characters: [
            {
              id: 100,
              name: 'Tharion',
              realm: { slug: 'area-52' },
              playable_class: { id: 1 },
              playable_race: { id: 2 },
              faction: { type: 'HORDE' },
              level: 90,
            },
          ],
        },
      ],
    };
    const result = userProfileSchema.parse(input);
    expect(result.wow_accounts).toHaveLength(1);
    expect(result.wow_accounts[0].characters[0].name).toBe('Tharion');
    expect(result.wow_accounts[0].characters[0].level).toBe(90);
  });

  it('rejects missing required fields', () => {
    expect(() => userProfileSchema.parse({})).toThrow();
    expect(() => userProfileSchema.parse({ wow_accounts: [{ id: 1 }] })).toThrow();
  });
});

describe('characterProfileSchema', () => {
  it('parses a valid character profile', () => {
    const input = {
      id: 100,
      name: 'Tharion',
      level: 90,
      equipped_item_level: 627,
      character_class: { id: 1 },
      race: { id: 2 },
      faction: { type: 'HORDE' },
    };
    const result = characterProfileSchema.parse(input);
    expect(result.name).toBe('Tharion');
    expect(result.equipped_item_level).toBe(627);
  });

  it('allows optional equipped_item_level', () => {
    const input = {
      id: 100,
      name: 'Tharion',
      level: 10,
      character_class: { id: 1 },
      race: { id: 2 },
      faction: { type: 'ALLIANCE' },
    };
    const result = characterProfileSchema.parse(input);
    expect(result.equipped_item_level).toBeUndefined();
  });
});

describe('completedQuestsSchema', () => {
  it('parses a quest list', () => {
    const input = { quests: [{ id: 93890 }, { id: 93767 }, { id: 94457 }] };
    const result = completedQuestsSchema.parse(input);
    expect(result.quests).toHaveLength(3);
    expect(result.quests[0].id).toBe(93890);
  });

  it('handles empty quest list', () => {
    const result = completedQuestsSchema.parse({ quests: [] });
    expect(result.quests).toHaveLength(0);
  });
});

describe('reputationsSchema', () => {
  it('parses a reputations response', () => {
    const input = {
      reputations: [
        {
          faction: { id: 2601, name: 'Silvermoon Court' },
          standing: {
            raw: 15000,
            value: 2500,
            max: 2500,
            tier: 12,
            name: 'Renown 12',
          },
        },
      ],
    };
    const result = reputationsSchema.parse(input);
    expect(result.reputations).toHaveLength(1);
    expect(result.reputations[0].faction.name).toBe('Silvermoon Court');
    expect(result.reputations[0].standing.tier).toBe(12);
  });
});
