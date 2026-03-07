import { z } from 'zod';

export const userProfileSchema = z.object({
  wow_accounts: z.array(
    z.object({
      id: z.number(),
      characters: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          realm: z.object({ slug: z.string() }),
          playable_class: z.object({ id: z.number() }),
          playable_race: z.object({ id: z.number() }),
          faction: z.object({ type: z.string() }),
          level: z.number(),
        }),
      ),
    }),
  ),
});

export const characterProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number(),
  equipped_item_level: z.number().optional(),
  character_class: z.object({ id: z.number() }),
  race: z.object({ id: z.number() }),
  faction: z.object({ type: z.string() }),
});

export const completedQuestsSchema = z.object({
  quests: z.array(z.object({ id: z.number() })),
});

export const reputationsSchema = z.object({
  reputations: z.array(
    z.object({
      faction: z.object({ id: z.number(), name: z.string() }),
      standing: z.object({
        raw: z.number(),
        value: z.number(),
        max: z.number(),
        tier: z.number(),
        name: z.string(),
      }),
    }),
  ),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type CharacterProfile = z.infer<typeof characterProfileSchema>;
export type CompletedQuests = z.infer<typeof completedQuestsSchema>;
export type Reputations = z.infer<typeof reputationsSchema>;
