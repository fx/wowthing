import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { db } from '~/db';
import { addonUploads } from '~/db/schema';
import { luaToJson } from '~/lib/addon/lua-parser';
import { type AddonUpload, uploadSchema } from '~/lib/addon/schema';
import { authMiddleware } from '~/lib/auth/middleware';
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

    // Store raw upload
    const [upload] = await db
      .insert(addonUploads)
      .values({
        userId,
        rawLua: luaText,
        byteSize: new TextEncoder().encode(luaText).byteLength,
      })
      .returning({ id: addonUploads.id });

    try {
      const parsed = parseAddonUpload(luaText);
      const charCount = Object.keys(parsed.chars).length;

      // Mark as processed
      await db
        .update(addonUploads)
        .set({
          status: 'processed',
          characterCount: charCount,
          processedAt: new Date(),
        })
        .where(eq(addonUploads.id, upload.id));

      const boss = await getBossAsync();
      await boss.send(
        'process-addon-upload',
        {
          userId,
          uploadId: upload.id,
          upload: parsed,
        },
        {
          singletonKey: `upload-${userId}`,
          expireInMinutes: 10,
        },
      );

      return { success: true, characterCount: charCount };
    } catch (err) {
      // Mark as failed
      await db
        .update(addonUploads)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        .where(eq(addonUploads.id, upload.id));

      throw err;
    }
  });
