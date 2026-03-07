import { z } from 'zod';

// Currency format: "quantity:max:isWeekly:weekQty:weekMax:isMovingMax:totalQty"
const currencyStringSchema = z.string().transform((s) => {
  const [qty, max, isWeekly, weekQty, weekMax, isMovingMax, totalQty] =
    s.split(':');
  return {
    quantity: parseInt(qty) || 0,
    max: parseInt(max) || 0,
    isWeekly: isWeekly === '1',
    weekQuantity: parseInt(weekQty) || 0,
    weekMax: parseInt(weekMax) || 0,
    isMovingMax: isMovingMax === '1',
    totalQuantity: parseInt(totalQty) || 0,
  };
});

// Progress quest: "key|questId|name|status|expires|obj1Type~obj1Text~have~need^obj2..."
const progressQuestSchema = z.string().transform((s) => {
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
  battleTag: z.string(),
  chars: z.record(z.string(), uploadCharacterSchema),
});

export type AddonUpload = z.infer<typeof uploadSchema>;
export type AddonCharacter = z.infer<typeof uploadCharacterSchema>;
