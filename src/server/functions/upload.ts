import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '~/lib/auth/middleware';
import { luaToJson } from '~/lib/addon/lua-parser';
import { uploadSchema } from '~/lib/addon/schema';
import { getBoss } from '~/server/plugins/pg-boss';

const uploadInputSchema = z.object({
  luaText: z.string(),
});

export const uploadAddonData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(uploadInputSchema)
  .handler(async ({ context, data }) => {
    const { luaText } = data;
    const json = luaToJson(luaText);
    const parsed = uploadSchema.parse(JSON.parse(json));

    const boss = getBoss();
    await boss.send(
      'process-addon-upload',
      {
        userId: context.userId,
        upload: parsed,
      },
      {
        singletonKey: `upload-${context.userId}`,
        expireInMinutes: 10,
      },
    );

    return { success: true, characterCount: Object.keys(parsed.chars).length };
  });
