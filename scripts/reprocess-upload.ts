import { db } from '../src/db';
import { accounts, addonUploads, characters, currencies, questCompletions, weeklyActivities } from '../src/db/schema';
import { desc, eq, inArray } from 'drizzle-orm';
import { processAddonUpload } from '../src/lib/addon/processor';
import { luaToJson } from '../src/lib/addon/lua-parser';
import { uploadSchema } from '../src/lib/addon/schema';

async function main() {
  const [latest] = await db.select().from(addonUploads).orderBy(desc(addonUploads.id)).limit(1);
  if (latest == null) { console.log('No uploads'); process.exit(1); }
  console.log('Upload id:', latest.id, 'userId:', latest.userId);

  const parsed = uploadSchema.parse(JSON.parse(luaToJson(latest.rawLua)));

  const userAccounts = await db.query.accounts.findMany({ where: eq(accounts.userId, latest.userId) });
  const userChars = await db.query.characters.findMany({ where: inArray(characters.accountId, userAccounts.map(a => a.id)) });
  const charIds = userChars.map(c => c.id);

  if (charIds.length > 0) {
    await db.delete(weeklyActivities).where(inArray(weeklyActivities.characterId, charIds));
    await db.delete(currencies).where(inArray(currencies.characterId, charIds));
    await db.delete(questCompletions).where(inArray(questCompletions.characterId, charIds));
  }

  await processAddonUpload(latest.userId, parsed);

  const wa = await db.select().from(weeklyActivities).where(inArray(weeklyActivities.characterId, charIds));
  for (const w of wa) {
    const char = userChars.find(c => c.id === w.characterId);
    const wp = w.weeklyProgress as Record<string, unknown[]> | null;
    console.log(`\n${char?.name} (id ${w.characterId}):`);
    console.log(`  prey=${w.preyHuntsCompleted}, delves=${w.delvesGilded}, lockouts=${w.lockouts ? (w.lockouts as unknown[]).length : 0}`);
    if (wp) {
      console.log(`  weeklyProgress.preyHunts: ${JSON.stringify(wp.preyHunts)}`);
      console.log(`  weeklyProgress.specialAssignments: ${JSON.stringify(wp.specialAssignments)}`);
      console.log(`  weeklyProgress.dungeonWeeklies: ${JSON.stringify(wp.dungeonWeeklies)}`);
      console.log(`  weeklyProgress.delves: ${JSON.stringify(wp.delves)}`);
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
