/**
 * Decode WoWThing addon's delta-encoded completedQuestsSquish format.
 *
 * Format: "startId.deltas|startId.deltas|..."
 * - Segments separated by |
 * - Each segment: startId (decimal) followed by .deltas
 * - Each delta character maps to a value 1-88 via a custom alphabet
 * - Running sum of deltas produces completed quest IDs
 *
 * @see https://github.com/ThingEngineering/wowthing-collector Core.lua DeltaEncode/DeltaDecode
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`~!@#$%^&*()-_=+[{]};:,<.>/?';

const CHAR_TO_DELTA = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  CHAR_TO_DELTA.set(ALPHABET[i], i + 1);
}

export function unsquish(squished: string): Set<number> {
  const result = new Set<number>();

  for (const part of squished.split('|')) {
    if (!part) continue;

    const dotIndex = part.indexOf('.');
    const startIdStr = dotIndex === -1 ? part : part.substring(0, dotIndex);
    const startId = parseInt(startIdStr, 10);
    if (!Number.isFinite(startId)) continue;

    let id = startId;
    result.add(id);

    if (dotIndex !== -1) {
      const deltas = part.substring(dotIndex + 1);
      for (const ch of deltas) {
        const delta = CHAR_TO_DELTA.get(ch);
        if (delta === undefined) continue;
        id += delta;
        result.add(id);
      }
    }
  }

  return result;
}
