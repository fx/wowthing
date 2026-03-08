import { z } from 'zod';

// Currency format: "quantity:max:isWeekly:weekQty:weekMax:isMovingMax:totalQty"
const currencyStringSchema = z
  .string()
  .refine(
    (s) => {
      const parts = s.split(':');
      if (parts.length !== 7) return false;
      const [qty, max, isWeekly, weekQty, weekMax, isMovingMax, totalQty] =
        parts;
      const intFields = [qty, max, weekQty, weekMax, totalQty];
      if (!intFields.every((v) => v !== '' && Number.isFinite(Number(v))))
        return false;
      if (!['0', '1'].includes(isWeekly)) return false;
      if (!['0', '1'].includes(isMovingMax)) return false;
      return true;
    },
    { message: 'Invalid currency string format' },
  )
  .transform((s) => {
    const [qty, max, isWeekly, weekQty, weekMax, isMovingMax, totalQty] =
      s.split(':');
    return {
      quantity: Number.parseInt(qty, 10),
      max: Number.parseInt(max, 10),
      isWeekly: isWeekly === '1',
      weekQuantity: Number.parseInt(weekQty, 10),
      weekMax: Number.parseInt(weekMax, 10),
      isMovingMax: isMovingMax === '1',
      totalQuantity: Number.parseInt(totalQty, 10),
    };
  });

// Progress quest: "key|questId|name|status|expires|obj1Type~obj1Text~have~need^obj2..."
const progressQuestSchema = z
  .string()
  .refine(
    (s) => {
      const parts = s.split('|');
      if (parts.length < 5) return false;
      const [, questId, , status, expires] = parts;
      return (
        Number.isFinite(Number.parseInt(questId)) &&
        Number.isFinite(Number.parseInt(status)) &&
        Number.isFinite(Number.parseInt(expires))
      );
    },
    { message: 'Invalid progress quest string' },
  )
  .transform((s) => {
    const [key, questId, name, status, expires, ...objParts] = s.split('|');
    const objStr = objParts.join('|');
    const objectives = objStr
      ? objStr
          .split(/_(?=(?:monster|object|item|event|progressbar);)/i)
          .map((obj) => {
            const parts = obj.split(';');
            const type = parts[0];
            const need = Number.parseInt(parts[parts.length - 1]) || 0;
            const have = Number.parseInt(parts[parts.length - 2]) || 0;
            const text = parts.slice(1, -2).join(';');
            return { type, text, have, need };
          })
      : [];
    return {
      key,
      questId: Number.parseInt(questId),
      name,
      status: Number.parseInt(status),
      expires: Number.parseInt(expires),
      objectives,
    };
  });

const lockoutSchema = z.object({
  id: z.number(),
  name: z.string(),
  difficulty: z.number(),
  maxBosses: z.number(),
  defeatedBosses: z.number(),
  locked: z.boolean(),
  resetTime: z.number(),
  bosses: z.array(z.string()).optional(),
});

const vaultSlotSchema = z.union([
  z.object({
    threshold: z.number(),
    progress: z.number(),
    level: z.number().optional(),
    tier: z.number().optional(),
    rewards: z.any().optional(),
  }),
  z.array(z.number()),
]);

const uploadCharacterSchema = z.object({
  name: z.string().optional(),
  level: z.number().optional(),
  copper: z.number().optional(),
  guildName: z.string().optional(),
  keystoneInstance: z.number().optional(),
  keystoneLevel: z.number().optional(),
  dailyReset: z.number().optional(),
  weeklyReset: z.number().optional(),
  currencies: z.record(z.string(), currencyStringSchema).optional(),
  progressQuests: z.array(progressQuestSchema).optional(),
  dailyQuests: z.array(z.number()).optional(),
  otherQuests: z.array(z.number()).optional(),
  lockouts: z.array(lockoutSchema).optional(),
  vault: z.record(z.string(), z.array(vaultSlotSchema)).optional(),
  delvesGilded: z.number().optional(),
  completedQuestsSquish: z.string().optional(),
  scanTimes: z.record(z.string(), z.number()).optional(),
});

export const uploadSchema = z.object({
  version: z.number(),
  chars: z.record(z.string(), uploadCharacterSchema),
  questsV2: z.record(z.string(), z.number()).optional(),
});

export type AddonUpload = z.infer<typeof uploadSchema>;
export type AddonCharacter = z.infer<typeof uploadCharacterSchema>;
