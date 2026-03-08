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
      quantity: parseInt(qty, 10),
      max: parseInt(max, 10),
      isWeekly: isWeekly === '1',
      weekQuantity: parseInt(weekQty, 10),
      weekMax: parseInt(weekMax, 10),
      isMovingMax: isMovingMax === '1',
      totalQuantity: parseInt(totalQty, 10),
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
        Number.isFinite(parseInt(questId)) &&
        Number.isFinite(parseInt(status)) &&
        Number.isFinite(parseInt(expires))
      );
    },
    { message: 'Invalid progress quest string' },
  )
  .transform((s) => {
    const [key, questId, name, status, expires, ...objParts] = s.split('|');
    const objectives = objParts.join('|')
      ? objParts
          .join('|')
          .split('^')
          .map((obj) => {
            const [type, text, have, need] = obj.split('~');
            return {
              type,
              text,
              have: parseInt(have) || 0,
              need: parseInt(need) || 0,
            };
          })
      : [];
    return {
      key,
      questId: parseInt(questId),
      name,
      status: parseInt(status),
      expires: parseInt(expires),
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

const uploadCharacterSchema = z.object({
  level: z.number().optional(),
  copper: z.number().optional(),
  keystoneInstance: z.number().optional(),
  keystoneLevel: z.number().optional(),
  dailyReset: z.number().optional(),
  weeklyReset: z.number().optional(),
  currencies: z.record(z.string(), currencyStringSchema).optional(),
  progressQuests: z.array(progressQuestSchema).optional(),
  dailyQuests: z.array(z.number()).optional(),
  otherQuests: z.array(z.number()).optional(),
  lockouts: z.array(lockoutSchema).optional(),
  vault: z.record(z.string(), z.array(z.any())).optional(),
  scanTimes: z.record(z.string(), z.number()).optional(),
});

export const uploadSchema = z.object({
  version: z.number(),
  chars: z.record(z.string(), uploadCharacterSchema),
});

export type AddonUpload = z.infer<typeof uploadSchema>;
export type AddonCharacter = z.infer<typeof uploadCharacterSchema>;
