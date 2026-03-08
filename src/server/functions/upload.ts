import { createServerFn } from '@tanstack/react-start';
import { z, ZodError } from 'zod';
import { authMiddleware } from '~/lib/auth/middleware';
import { luaToJson } from '~/lib/addon/lua-parser';
import { type AddonUpload, uploadSchema } from '~/lib/addon/schema';
import { getBossAsync } from '~/server/plugins/pg-boss';

const uploadInputSchema = z.object({
  luaText: z.string(),
});

/**
 * Parse raw Lua addon text into a validated AddonUpload object.
 * Logs structured errors for each failure stage before re-throwing.
 */
export function parseAddonUpload(luaText: string): AddonUpload {
  let json: string;
  try {
    json = luaToJson(luaText);
  } catch (err) {
    console.error(
      '[upload] luaToJson failed:',
      err instanceof Error ? err.message : err,
      '| input length:',
      luaText.length,
    );
    throw err;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    console.error(
      '[upload] JSON.parse failed:',
      err instanceof Error ? err.message : err,
      '| json length:',
      json.length,
    );
    throw err;
  }

  try {
    return uploadSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(
        '[upload] schema validation failed:',
        JSON.stringify(err.issues),
        '| top-level keys:',
        typeof raw === 'object' && raw !== null ? Object.keys(raw) : 'N/A',
      );
    } else {
      console.error('[upload] schema validation failed:', err);
    }
    throw err;
  }
}

export const checkUploadAuth = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    return { ok: true };
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

    const parsed = parseAddonUpload(luaText);

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
