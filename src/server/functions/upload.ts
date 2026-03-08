import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authMiddleware } from '~/lib/auth/middleware';
import { luaToJson } from '~/lib/addon/lua-parser';
import { uploadSchema } from '~/lib/addon/schema';
import { getBossAsync } from '~/server/plugins/pg-boss';

const uploadInputSchema = z.object({
  luaText: z.string(),
});

export const uploadAddonData = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(uploadInputSchema)
  .handler(async ({ context, data }) => {
    const { luaText } = data;
    const userId = parseInt(context.userId);
    if (!Number.isFinite(userId)) {
      throw new Error('Invalid user id');
    }

    const json = luaToJson(luaText);
    const parsed = uploadSchema.parse(JSON.parse(json));

    const boss = await getBossAsync();
    await boss.send(
      'process-addon-upload',
      {
        userId,
        upload: parsed,
      },
      {
        singletonKey: `upload-${userId}`,
        expireInMinutes: 10,
      },
    );

    return { success: true, characterCount: Object.keys(parsed.chars).length };
  });
