# Frontend: Dashboard, Components, Upload UI

## Overview

Implement the complete frontend for the WoWThing Midnight Activity Tracker. The centerpiece is the dashboard — a single page that answers "What do I still need to do this week, across all my characters?" Built with @fx/ui components (React 19 + Base UI + Tailwind CSS v4 + CVA), SSR via TanStack Start, and TanStack Query for data freshness. Includes the login page, addon upload page, responsive mobile layout, reset countdown timers, and all WoW-specific visual design (class colors, vault dots, progress bars, lockout grids).

## Background

This is spec 2 of 2 for the WoWThing reimagined project described in [docs/poc.md](../poc.md). It covers poc.md section 10 (Frontend Design), section 11 (Reset Timer System), and the upload UI from section 8.

WoWThing's frontend is a Svelte SPA with no SSR, hash-based routing, and a massive HomeTable that shows everything at once. We replace it with focused dashboard sections, SSR for fast initial load, and a mobile-friendly card layout.

All data comes from server functions defined in spec 0001 (`getDashboardData`, `uploadAddonData`, `triggerSync`). This spec only consumes those APIs.

Related specs:
- [0001-backend](./0001-backend.md) — Server functions, DB schema, auth (prerequisite)

## Goals

- Root layout with nav bar, theme toggle (dark/light via @fx/ui), and reset countdown timers
- Login page with "Login with Battle.net" button
- Dashboard page with 7 sections:
  1. Great Vault progress (M+/Raid/World dot indicators per character)
  2. Weekly checklist matrix (activities x characters with completion status)
  3. Dawncrest currency cap progress bars
  4. Renown section (account-wide faction bars)
  5. Raid lockout grid (per-difficulty boss counts)
  6. Keystone display (current dungeon + level per character)
  7. Daily activities section
- Upload page with drag-and-drop `.lua` file upload
- Mobile-responsive layout: desktop matrix -> mobile expandable character cards
- Color coding system: complete (green), in-progress (amber), urgent (red), not started (zinc)
- Characters sorted by level descending
- TanStack Query data refresh: 60s staleTime, refetch on window focus, manual invalidation after upload
- Empty states for new users (no characters, no addon data)
- WoW class colors on character names

## Non-Goals

- Character detail page (defer)
- Character filtering/hiding
- Historical data visualization
- Settings page (beyond upload)
- Notifications / push alerts
- Admin interface

## Design

### @fx/ui Setup

Install from GitHub Packages:

```
bun add @fx/ui@0.0.0-28fe5ad
```

`.npmrc`:
```
@fx:registry=https://npm.pkg.github.com
```

Tailwind CSS v4 entry point:

```css
/* src/global.css */
@import 'tailwindcss';
@import '@fx/ui/styles';
```

#### Components Used from @fx/ui

| Component | Where Used |
|-----------|-----------|
| `Button` | Login, Sync Now, Upload, navigation actions |
| `Badge` | Reset timer displays, status indicators, character level |
| `Card` | Section containers, character cards, upload dropzone |
| `Progress` | Dawncrest cap bars, renown bars |
| `Table` | Weekly checklist matrix, lockout grid, vault section |
| `Collapsible` | Mobile character card expand/collapse |
| `Tooltip` | Vault dot details, currency breakdowns, activity descriptions |
| `Separator` | Between dashboard sections |
| `Skeleton` | Loading states while data fetches |
| `Toast` | Upload success/failure feedback |
| `Switch` | Theme toggle (dark/light) |
| `DropdownMenu` | User menu (sync, upload, logout) |
| `Sheet` | Mobile nav menu |

For any component @fx/ui doesn't provide, build with shadcn + Base UI patterns to match @fx/ui styling.

### Page Structure

#### Routes

| Route | Page | Auth Required |
|-------|------|---------------|
| `/` | Dashboard | Yes |
| `/login` | Login | No |
| `/upload` | Addon Upload | Yes |

#### Root Layout

```typescript
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { Nav } from '~/components/layout/Nav';

interface RouterContext {
  session: Session | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>WoWThing</title>
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <Nav />
        <main className="container mx-auto px-4 py-6 max-w-7xl">
          <Outlet />
        </main>
      </body>
    </html>
  );
}
```

#### Dashboard Route

```typescript
// src/routes/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { getDashboardData } from '~/server/functions/activities';
import { Dashboard } from '~/components/dashboard/Dashboard';

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
  },
  loader: () => getDashboardData(),
  staleTime: 60_000,
  component: () => {
    const data = Route.useLoaderData();
    return <Dashboard {...data} />;
  },
});
```

### Nav Component

Fixed top bar with app name, reset timers, and user actions.

```typescript
// src/components/layout/Nav.tsx
import { Button, Badge, DropdownMenu, Switch, Sheet } from '@fx/ui';
import { ResetTimers } from './ResetTimers';
import { useMediaQuery } from '~/hooks/useMediaQuery';

export function Nav({ session, nextWeeklyReset, nextDailyReset }: NavProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-14">
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg">WoWThing</span>
          {!isMobile && nextWeeklyReset && (
            <ResetTimers weekly={nextWeeklyReset} daily={nextDailyReset} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <ThemeToggle />

          {session && (
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="sm">{session.user.name}</Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item onSelect={handleSync}>Sync Now</DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <a href="/upload">Upload Addon Data</a>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={handleLogout}>Logout</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Mobile: show reset timers below nav */}
      {isMobile && nextWeeklyReset && (
        <div className="px-4 pb-2 flex justify-center">
          <ResetTimers weekly={nextWeeklyReset} daily={nextDailyReset} />
        </div>
      )}
    </nav>
  );
}
```

### Reset Timer System

#### Hook

Client-side countdown that ticks every second. Timestamps injected during SSR.

```typescript
// src/hooks/useResetTimer.ts
import { useState, useEffect } from 'react';

export function useResetTimer(resetTime: string): string {
  const target = new Date(resetTime).getTime();
  const [remaining, setRemaining] = useState(() => formatDiff(target - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = target - Date.now();
      setRemaining(diff <= 0 ? 'Reset!' : formatDiff(diff));
      if (diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return remaining;
}

function formatDiff(ms: number): string {
  if (ms <= 0) return 'Reset!';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
```

#### Component

```typescript
// src/components/layout/ResetTimers.tsx
import { Badge } from '@fx/ui';
import { useResetTimer } from '~/hooks/useResetTimer';

export function ResetTimers({ weekly, daily }: { weekly: string; daily: string }) {
  const weeklyTime = useResetTimer(weekly);
  const dailyTime = useResetTimer(daily);

  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge variant="outline" className="font-mono">Daily: {dailyTime}</Badge>
      <Badge variant="outline" className="font-mono">Weekly: {weeklyTime}</Badge>
    </div>
  );
}
```

### Dashboard Component

Top-level component that renders all sections.

```typescript
// src/components/dashboard/Dashboard.tsx — DesktopDashboard portion
import { VaultSection } from './VaultSection';
import { WeeklyChecklist } from './WeeklyChecklist';
import { CrestTracker } from './CrestTracker';
import { KeystoneDisplay } from './KeystoneDisplay';
import { RenownSection } from './RenownSection';
import { LockoutGrid } from './LockoutGrid';
import { DailySection } from './DailySection';
import type { DashboardData } from '~/server/functions/activities';

interface DesktopDashboardProps extends DashboardData {
  collapsedColumns: Set<string>;
  onToggleCollapse: (id: string) => void;
}

function DesktopDashboard({ characters, activities, renown, collapsedColumns, onToggleCollapse }: DesktopDashboardProps) {
  const weeklyActivities = activities.filter(a => a.category === 'weekly');
  const dailyActivities = activities.filter(a => a.category === 'daily');
  const gridProps = { characters, collapsedColumns, onToggleCollapse };

  return (
    <div className="space-y-4">
      <VaultSection {...gridProps} />
      <WeeklyChecklist {...gridProps} activities={weeklyActivities} />
      <CrestTracker {...gridProps} />
      <KeystoneDisplay {...gridProps} />
      <RenownSection renown={renown} />
      <LockoutGrid {...gridProps} />
      <DailySection activities={dailyActivities} />
    </div>
  );
}
```

### Section 1: Great Vault

3 rows (M+, Raid, World) inside the shared `MatrixGrid`. Each cell shows 3 progress dots (filled/empty) with Tooltip for ilvl detail. Collapsed columns show a single green/gray dot.

```typescript
// src/components/dashboard/VaultSection.tsx
import { Card, Tooltip } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { cn } from '~/lib/utils';

export function VaultSection({ characters, collapsedColumns, onToggleCollapse }: GridSectionProps) {
  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Great Vault</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        <MatrixGrid characters={characters} collapsedColumns={collapsedColumns} onToggleCollapse={onToggleCollapse}>
          {({ characters, isCollapsed }) => (
            <>
              <VaultRow label="M+" thresholds={[1, 4, 8]} characters={characters} field="vaultDungeonProgress" isCollapsed={isCollapsed} />
              <VaultRow label="Raid" thresholds={[2, 4, 6]} characters={characters} field="vaultRaidProgress" isCollapsed={isCollapsed} />
              <VaultRow label="World" thresholds={[2, 4, 8]} characters={characters} field="vaultWorldProgress" isCollapsed={isCollapsed} />
            </>
          )}
        </MatrixGrid>
      </Card.Content>
    </Card>
  );
}

function VaultDots({ slots, thresholds }: { slots: VaultSlot[] | null; thresholds: number[] }) {
  return (
    <div className="flex gap-0.5 items-center">
      {thresholds.map((threshold, i) => {
        const slot = slots?.[i];
        const filled = slot && slot.progress >= slot.threshold;
        return (
          <Tooltip key={i} content={
            slot ? `${slot.progress}/${slot.threshold} — ilvl ${slot.itemLevel}` : 'Not started'
          }>
            <div className={cn(
              'h-2.5 w-2.5 rounded-full',
              filled ? 'bg-emerald-500' : 'bg-zinc-700'
            )} />
          </Tooltip>
        );
      })}
    </div>
  );
}
```

### Section 2: Weekly Checklist

Activity rows × character columns inside `MatrixGrid`. Each cell is a dense `StatusCell` — colored square with tooltip. Filters out activities that have dedicated sections (vault, crests, lockouts).

```typescript
// src/components/dashboard/WeeklyChecklist.tsx
import { Card, Tooltip } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';

interface WeeklyChecklistProps extends GridSectionProps {
  activities: ActivityDef[];
}

export function WeeklyChecklist({ characters, activities, collapsedColumns, onToggleCollapse }: WeeklyChecklistProps) {
  const checklistActivities = activities.filter(a =>
    !a.key.startsWith('vault_') &&
    !a.key.startsWith('dawncrest_') &&
    !a.key.startsWith('lockout_')
  );

  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Weekly Checklist</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        <MatrixGrid characters={characters} collapsedColumns={collapsedColumns} onToggleCollapse={onToggleCollapse}>
          {({ characters, isCollapsed }) => (
            <>
              {checklistActivities.map(activity => (
                <tr key={activity.key}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    <Tooltip content={activity.description ?? activity.name}>
                      <span>{activity.shortName}</span>
                    </Tooltip>
                  </td>
                  {characters.map(char => {
                    const { state, label, tooltip } = resolveActivityStatus(char, activity);
                    return (
                      <StatusCell
                        key={char.id}
                        state={state}
                        label={label}
                        tooltip={tooltip}
                        collapsed={isCollapsed(char.id)}
                      />
                    );
                  })}
                </tr>
              ))}
            </>
          )}
        </MatrixGrid>
      </Card.Content>
    </Card>
  );
}

function resolveActivityStatus(char: Character, activity: ActivityDef) {
  const completions = char.questCompletions ?? [];
  const matches = completions.filter(qc => activity.questIds?.includes(qc.questId));

  if (activity.accountWide && matches.length > 0) {
    return { state: 'account-done' as const, label: '✓', tooltip: `${activity.name}: Done (account-wide)` };
  }
  if (activity.threshold && activity.threshold > 1) {
    const count = matches.length;
    const done = count >= activity.threshold;
    return {
      state: done ? 'complete' as const : 'in-progress' as const,
      label: `${count}/${activity.threshold}`,
      tooltip: `${activity.name}: ${count}/${activity.threshold}`,
    };
  }
  const done = matches.length > 0;
  return {
    state: done ? 'complete' as const : 'not-started' as const,
    label: undefined,
    tooltip: `${activity.name}: ${done ? 'Complete' : 'Not started'}`,
  };
}
```

### Section 3: Dawncrest Currency Caps

5 tier rows inside `MatrixGrid`. Each cell shows a compact `qty/max` label colored by completion percentage. Collapsed columns show a single dot colored by overall cap status.

```typescript
// src/components/dashboard/CrestTracker.tsx
import { Card } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';

const DAWNCREST_TIERS = [
  { key: 'adventurer', id: 3383, name: 'Adventurer' },
  { key: 'veteran',    id: 3341, name: 'Veteran' },
  { key: 'champion',   id: 3343, name: 'Champion' },
  { key: 'hero',       id: 3345, name: 'Hero' },
  { key: 'myth',       id: 3348, name: 'Myth' },
] as const;

export function CrestTracker({ characters, collapsedColumns, onToggleCollapse }: GridSectionProps) {
  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Dawncrests</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        <MatrixGrid characters={characters} collapsedColumns={collapsedColumns} onToggleCollapse={onToggleCollapse}>
          {({ characters, isCollapsed }) => (
            <>
              {DAWNCREST_TIERS.map(tier => (
                <tr key={tier.key}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">{tier.name}</td>
                  {characters.map(char => {
                    const currency = char.currencies?.find(c => c.currencyId === tier.id);
                    const weekQty = currency?.weekQuantity ?? 0;
                    const weekMax = currency?.weekMax ?? 100;
                    const pct = weekMax > 0 ? weekQty / weekMax : 0;
                    const state = pct >= 1 ? 'complete' : pct > 0 ? 'in-progress' : 'not-started';
                    return (
                      <StatusCell
                        key={char.id}
                        state={state}
                        label={`${weekQty}`}
                        tooltip={`${char.name} ${tier.name}: ${weekQty}/${weekMax}`}
                        collapsed={isCollapsed(char.id)}
                      />
                    );
                  })}
                </tr>
              ))}
            </>
          )}
        </MatrixGrid>
      </Card.Content>
    </Card>
  );
}
```

### Section 4: Keystone Display

Single-row `MatrixGrid` showing current keystone dungeon + level per character. Hidden if no characters have keystones. Collapsed columns show key level as a number.

```typescript
// src/components/dashboard/KeystoneDisplay.tsx
import { Card } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';

export function KeystoneDisplay({ characters, collapsedColumns, onToggleCollapse }: GridSectionProps) {
  const hasAnyKey = characters.some(c => c.weeklyActivities?.[0]?.keystoneLevel);
  if (!hasAnyKey) return null;

  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Mythic+ Keystones</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        <MatrixGrid characters={characters} collapsedColumns={collapsedColumns} onToggleCollapse={onToggleCollapse}>
          {({ characters, isCollapsed }) => (
            <tr>
              <td className="sticky left-0 z-10 bg-card p-2 text-sm">Key</td>
              {characters.map(char => {
                const weekly = char.weeklyActivities?.[0];
                const level = weekly?.keystoneLevel;
                return (
                  <StatusCell
                    key={char.id}
                    state={level ? 'complete' : 'not-started'}
                    label={level ? `+${level}` : undefined}
                    tooltip={level
                      ? `${char.name}: +${level} ${weekly?.keystoneDungeon ?? ''}`
                      : `${char.name}: No keystone`
                    }
                    collapsed={isCollapsed(char.id)}
                  />
                );
              })}
            </tr>
          )}
        </MatrixGrid>
      </Card.Content>
    </Card>
  );
}
```

### Section 5: Renown

Account-wide progress bars for 4 Midnight factions.

```typescript
// src/components/dashboard/RenownSection.tsx
import { Card, Progress } from '@fx/ui';

const MIDNIGHT_FACTIONS = [
  { name: 'Silvermoon Court', zone: 'Eversong Woods' },
  { name: 'Amani Tribe', zone: "Zul'Aman" },
  { name: "Hara'ti", zone: 'Harandar' },
  { name: 'Singularity', zone: 'Voidstorm' },
];

export function RenownSection({ renown }: { renown: RenownData[] }) {
  if (renown.length === 0) return null;

  return (
    <Card>
      <Card.Header>
        <Card.Title>Renown (Account-wide)</Card.Title>
      </Card.Header>
      <Card.Content className="space-y-3">
        {MIDNIGHT_FACTIONS.map(faction => {
          const data = renown.find(r => r.factionName === faction.name);
          const level = data?.renownLevel ?? 0;
          return (
            <div key={faction.name} className="flex items-center gap-3">
              <span className="text-sm font-medium w-40">{faction.name}</span>
              <Progress value={(level / 20) * 100} className="flex-1 h-3" />
              <span className="text-sm text-muted-foreground w-12 text-right">{level}/20</span>
            </div>
          );
        })}
      </Card.Content>
    </Card>
  );
}
```

### Section 6: Raid Lockouts

Per-difficulty boss kill rows inside `MatrixGrid`. Only shows rows where at least one character has kills. Cells show `killed/total` label in `StatusCell`.

```typescript
// src/components/dashboard/LockoutGrid.tsx
import { Card } from '@fx/ui';
import { MatrixGrid } from './MatrixGrid';
import { StatusCell } from './StatusCell';

const RAIDS = [
  { id: 16340, name: 'Voidspire', bossCount: 6 },
  { id: 16531, name: 'Dreamrift', bossCount: 1 },
  { id: 16215, name: "March on Quel'Danes", bossCount: 2 },
];

const DIFFICULTIES = ['normal', 'heroic', 'mythic'] as const;
const DIFF_SHORT = { normal: 'N', heroic: 'H', mythic: 'M' } as const;

export function LockoutGrid({ characters, collapsedColumns, onToggleCollapse }: GridSectionProps) {
  const rows = RAIDS.flatMap(raid =>
    DIFFICULTIES.map(diff => ({ raid, difficulty: diff }))
  );

  const activeRows = rows.filter(row =>
    characters.some(char => {
      const lockouts = char.weeklyActivities?.[0]?.lockouts as Lockout[] | null;
      return lockouts?.some(l =>
        l.instanceId === row.raid.id && l.difficulty === row.difficulty && l.bossesKilled > 0
      );
    })
  );

  if (activeRows.length === 0) return null;

  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Raid Lockouts</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        <MatrixGrid characters={characters} collapsedColumns={collapsedColumns} onToggleCollapse={onToggleCollapse}>
          {({ characters, isCollapsed }) => (
            <>
              {activeRows.map(row => (
                <tr key={`${row.raid.id}-${row.difficulty}`}>
                  <td className="sticky left-0 z-10 bg-card p-2 text-sm">
                    {row.raid.name} ({DIFF_SHORT[row.difficulty]})
                  </td>
                  {characters.map(char => {
                    const lockouts = char.weeklyActivities?.[0]?.lockouts as Lockout[] | null;
                    const lockout = lockouts?.find(l =>
                      l.instanceId === row.raid.id && l.difficulty === row.difficulty
                    );
                    const killed = lockout?.bossesKilled ?? 0;
                    const total = lockout?.bossCount ?? row.raid.bossCount;
                    const state = !lockout ? 'not-started' : killed === total ? 'complete' : 'in-progress';
                    return (
                      <StatusCell
                        key={char.id}
                        state={state}
                        label={lockout ? `${killed}/${total}` : undefined}
                        tooltip={`${char.name}: ${row.raid.name} ${DIFF_SHORT[row.difficulty]} — ${killed}/${total}`}
                        collapsed={isCollapsed(char.id)}
                      />
                    );
                  })}
                </tr>
              ))}
            </>
          )}
        </MatrixGrid>
      </Card.Content>
    </Card>
  );
}
```

### Section 7: Daily Activities

Placeholder for bountiful delves and other daily tracking.

```typescript
// src/components/dashboard/DailySection.tsx
import { Card, Badge } from '@fx/ui';

export function DailySection({ activities }: { activities: ActivityDef[] }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Daily Activities</Card.Title>
      </Card.Header>
      <Card.Content>
        {activities.map(activity => (
          <div key={activity.key} className="flex items-center justify-between py-2">
            <span>{activity.name}</span>
            <Badge variant="outline">{activity.description}</Badge>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
```

### Shared Components

#### Character Name (with class color)

```typescript
// src/components/shared/CharacterName.tsx
import { CLASS_COLORS } from '~/lib/wow/classes';

export function CharacterName({ character }: { character: { name: string; classId: number } }) {
  const classInfo = CLASS_COLORS[character.classId];
  return (
    <span className="font-medium text-sm" style={{ color: classInfo?.color }}>
      {character.name}
    </span>
  );
}
```

### Color Coding System

```typescript
// src/lib/utils.ts (additions)
export type ActivityState = 'complete' | 'in-progress' | 'urgent' | 'not-started' | 'account-done';

export const STATE_CLASSES: Record<ActivityState, string> = {
  complete: 'bg-emerald-500/20 text-emerald-400',
  'in-progress': 'bg-amber-500/20 text-amber-400',
  urgent: 'bg-red-500/20 text-red-400',
  'not-started': 'bg-zinc-800 text-zinc-400',
  'account-done': 'bg-blue-500/20 text-blue-400',
};

export function getActivityState(
  isComplete: boolean,
  isAccountWide: boolean,
  hoursUntilReset: number,
): ActivityState {
  if (isComplete && isAccountWide) return 'account-done';
  if (isComplete) return 'complete';
  if (hoursUntilReset < 6) return 'urgent';
  return 'not-started';
}
```

### Matrix Grid System

All desktop dashboard sections share a common grid wrapper that handles horizontal scrolling, sticky activity labels, and per-character column collapsing.

#### Scroll Wrapper

```typescript
// src/components/dashboard/MatrixGrid.tsx
import { cn } from '~/lib/utils';

interface MatrixGridProps {
  characters: Character[];
  collapsedColumns: Set<string>;
  onToggleCollapse: (characterId: string) => void;
  children: (args: {
    characters: Character[];
    isCollapsed: (id: string) => boolean;
  }) => React.ReactNode;
}

export function MatrixGrid({ characters, collapsedColumns, onToggleCollapse, children }: MatrixGridProps) {
  const isCollapsed = (id: string) => collapsedColumns.has(id);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card min-w-40 text-left text-sm font-medium p-2" />
            {characters.map(char => (
              <th
                key={char.id}
                className={cn(
                  'p-1 text-center transition-all',
                  isCollapsed(char.id) ? 'w-8' : 'min-w-20'
                )}
              >
                {isCollapsed(char.id) ? (
                  <button
                    onClick={() => onToggleCollapse(char.id)}
                    className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 text-xs"
                    title={`Expand ${char.name}`}
                  >
                    ✓
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <CharacterName character={char} />
                    <button
                      onClick={() => onToggleCollapse(char.id)}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                      title="Collapse column"
                    >
                      ▼
                    </button>
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children({ characters, isCollapsed })}
        </tbody>
      </table>
    </div>
  );
}
```

Key behaviors:
- **Horizontal scroll**: `overflow-x-auto` on the wrapper; activity label column is `sticky left-0` so it stays visible while scrolling
- **Column collapse**: Toggle button on each character header. Collapsed columns shrink to a narrow `w-8` showing a single green check icon. Expand by clicking the icon.
- **Collapse state**: Stored in `localStorage` via a `useCollapsedColumns` hook, persists across page loads

#### Collapsed Column State Hook

```typescript
// src/hooks/useCollapsedColumns.ts
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'wowthing-collapsed-columns';

export function useCollapsedColumns() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);

  const toggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
```

#### Dense Status Cells

All matrix cells use compact colored indicators instead of full Badge components. The cell is a small square (~20×20px) with a status color, optionally containing a short label (e.g. "3/4"). Tooltip on hover reveals full detail.

```typescript
// src/components/dashboard/StatusCell.tsx
import { Tooltip } from '@fx/ui';
import { cn } from '~/lib/utils';
import type { ActivityState } from '~/lib/utils';

const CELL_COLORS: Record<ActivityState, string> = {
  complete: 'bg-emerald-500/30 text-emerald-300',
  'in-progress': 'bg-amber-500/30 text-amber-300',
  urgent: 'bg-red-500/30 text-red-300',
  'not-started': 'bg-zinc-800 text-zinc-500',
  'account-done': 'bg-blue-500/30 text-blue-300',
};

interface StatusCellProps {
  state: ActivityState;
  label?: string;        // short text inside cell, e.g. "3/4"
  tooltip: string;       // full detail on hover
  collapsed?: boolean;   // when column is collapsed, render nothing (parent handles)
}

export function StatusCell({ state, label, tooltip, collapsed }: StatusCellProps) {
  if (collapsed) return <td className="w-8" />;

  return (
    <td className="p-0.5 text-center">
      <Tooltip content={tooltip}>
        <div className={cn(
          'inline-flex items-center justify-center rounded-sm text-[11px] font-medium min-w-5 h-5 px-1',
          CELL_COLORS[state],
        )}>
          {label ?? (state === 'complete' || state === 'account-done' ? '✓' : '—')}
        </div>
      </Tooltip>
    </td>
  );
}
```

### Mobile Responsive Layout

At `< 768px`, the matrix is replaced by **per-activity cards** — each dashboard section renders as a Card containing a compact list of characters and their status for that activity.

```typescript
// src/components/dashboard/MobileDashboard.tsx
import { Card, Badge, Progress } from '@fx/ui';
import { CharacterName } from '../shared/CharacterName';

/**
 * Mobile layout: per-ACTIVITY cards, each showing all characters.
 * Same section order as desktop (Vault, Weekly, Crests, Keystones, Renown, Lockouts, Dailies)
 * but each section renders characters as compact rows inside the card.
 */
export function MobileDashboard({ characters, activities, renown }: DashboardData) {
  const weeklyActivities = activities.filter(a => a.category === 'weekly');
  const dailyActivities = activities.filter(a => a.category === 'daily');

  return (
    <div className="space-y-3">
      <MobileVaultCard characters={characters} />
      <MobileWeeklyCard characters={characters} activities={weeklyActivities} />
      <MobileCrestCard characters={characters} />
      <MobileKeystoneCard characters={characters} />
      <RenownSection renown={renown} />
      <MobileLockoutCard characters={characters} />
      <MobileDailyCard activities={dailyActivities} />
    </div>
  );
}

/**
 * Shared row layout used inside each mobile activity card.
 * Shows character name (class-colored) on the left, status on the right.
 */
function MobileCharacterRow({ character, children }: { character: Character; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <CharacterName character={character} />
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function MobileVaultCard({ characters }: { characters: Character[] }) {
  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Great Vault</Card.Title>
      </Card.Header>
      <Card.Content className="px-3 pb-2">
        {characters.map(char => (
          <MobileCharacterRow key={char.id} character={char}>
            {/* 3 dot groups: M+, Raid, World */}
            <VaultDots slots={char.vaultDungeonProgress} thresholds={[1, 4, 8]} />
            <span className="text-zinc-600">|</span>
            <VaultDots slots={char.vaultRaidProgress} thresholds={[2, 4, 6]} />
            <span className="text-zinc-600">|</span>
            <VaultDots slots={char.vaultWorldProgress} thresholds={[2, 4, 8]} />
          </MobileCharacterRow>
        ))}
      </Card.Content>
    </Card>
  );
}

function MobileWeeklyCard({ characters, activities }: { characters: Character[]; activities: ActivityDef[] }) {
  const checklistActivities = activities.filter(a =>
    !a.key.startsWith('vault_') && !a.key.startsWith('dawncrest_') && !a.key.startsWith('lockout_')
  );

  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Weekly Checklist</Card.Title>
      </Card.Header>
      <Card.Content className="px-3 pb-2">
        {characters.map(char => (
          <MobileCharacterRow key={char.id} character={char}>
            {/* Compact row of status dots, one per activity */}
            {checklistActivities.map(activity => {
              const state = getCharActivityState(char, activity);
              return (
                <div
                  key={activity.key}
                  className={cn('w-4 h-4 rounded-sm text-[9px] flex items-center justify-center', CELL_COLORS[state])}
                  title={activity.shortName}
                >
                  {state === 'complete' ? '✓' : '—'}
                </div>
              );
            })}
          </MobileCharacterRow>
        ))}
      </Card.Content>
    </Card>
  );
}

function MobileCrestCard({ characters }: { characters: Character[] }) {
  return (
    <Card>
      <Card.Header className="py-2 px-3">
        <Card.Title className="text-sm">Dawncrests</Card.Title>
      </Card.Header>
      <Card.Content className="px-3 pb-2">
        {characters.map(char => (
          <MobileCharacterRow key={char.id} character={char}>
            {/* Mini progress indicators for each tier */}
            {DAWNCREST_TIERS.map(tier => {
              const currency = char.currencies?.find(c => c.currencyId === tier.id);
              const pct = currency ? (currency.weekQuantity / currency.weekMax) * 100 : 0;
              return (
                <div key={tier.key} className="flex flex-col items-center" title={`${tier.name}: ${currency?.weekQuantity ?? 0}/${currency?.weekMax ?? 100}`}>
                  <div className={cn('w-3 h-3 rounded-full', tier.color)} style={{ opacity: Math.max(0.2, pct / 100) }} />
                </div>
              );
            })}
          </MobileCharacterRow>
        ))}
      </Card.Content>
    </Card>
  );
}
```

The Dashboard component detects screen size and renders either the desktop matrix or mobile activity cards:

```typescript
// In Dashboard.tsx
import { useMediaQuery } from '~/hooks/useMediaQuery';
import { useCollapsedColumns } from '~/hooks/useCollapsedColumns';
import { MobileDashboard } from './MobileDashboard';

export function Dashboard(props: DashboardData) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { collapsed, toggle } = useCollapsedColumns();

  if (props.characters.length === 0) return <EmptyState />;

  return isMobile
    ? <MobileDashboard {...props} />
    : <DesktopDashboard {...props} collapsedColumns={collapsed} onToggleCollapse={toggle} />;
}
```

Desktop sections receive `collapsedColumns` and `onToggleCollapse` and pass them through to `MatrixGrid`. Each section uses the shared grid wrapper for consistent horizontal scrolling and column collapse behavior.

```typescript
// src/hooks/useMediaQuery.ts
import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
```

### Login Page

```typescript
// src/routes/login.tsx
import { createFileRoute } from '@tanstack/react-router';
import { Button, Card } from '@fx/ui';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold">WoWThing</h1>
        <p className="text-muted-foreground">
          Track your Midnight weekly and daily activities
        </p>
        <Button asChild size="lg" className="w-full">
          <a href="/api/auth/signin/battlenet">Login with Battle.net</a>
        </Button>
      </Card>
    </div>
  );
}
```

### Upload Page

Drag-and-drop file upload with status feedback.

```typescript
// src/routes/upload.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { uploadAddonData } from '~/server/functions/upload';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Toast } from '@fx/ui';

export const Route = createFileRoute('/upload')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
  },
  component: UploadPage,
});

function UploadPage() {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const queryClient = useQueryClient();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.lua')) {
      setStatus('error');
      return;
    }
    setStatus('uploading');
    try {
      const luaText = await file.text();
      const result = await uploadAddonData({ data: { luaText } });
      setStatus('done');
      setCharCount(result.characterCount);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      setStatus('error');
    }
  }, [queryClient]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Upload Addon Data</h1>
      <p className="text-muted-foreground">
        Upload your <code className="text-sm bg-muted px-1 py-0.5 rounded">WoWthing_Collector.lua</code> file from:
      </p>
      <code className="block text-xs text-muted-foreground bg-muted p-3 rounded-lg">
        WoW/WTF/Account/YOUR_ACCOUNT/SavedVariables/WoWthing_Collector.lua
      </code>

      <Card
        className={cn(
          'border-2 border-dashed p-12 text-center cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          status === 'done' && 'border-emerald-500/50 bg-emerald-500/5',
          status === 'error' && 'border-red-500/50 bg-red-500/5',
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.lua';
          input.onchange = () => input.files?.[0] && handleFile(input.files[0]);
          input.click();
        }}
      >
        {status === 'idle' && (
          <div className="space-y-2">
            <p className="text-lg">Drop .lua file here or click to browse</p>
            <p className="text-sm text-muted-foreground">Accepts WoWthing_Collector.lua files</p>
          </div>
        )}
        {status === 'uploading' && <p className="text-lg">Processing...</p>}
        {status === 'done' && (
          <div className="space-y-2">
            <p className="text-lg text-emerald-400">Upload complete!</p>
            <p className="text-sm text-muted-foreground">{charCount} characters processed</p>
          </div>
        )}
        {status === 'error' && (
          <div className="space-y-2">
            <p className="text-lg text-red-400">Upload failed</p>
            <p className="text-sm text-muted-foreground">Check file format and try again</p>
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        {status === 'done' && (
          <Button asChild>
            <a href="/">Back to Dashboard</a>
          </Button>
        )}
        {(status === 'done' || status === 'error') && (
          <Button variant="outline" onClick={() => setStatus('idle')}>
            Upload Another
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Empty State

Shown when user has no characters (first login, before API sync completes).

```typescript
// src/components/dashboard/EmptyState.tsx
import { Button, Card } from '@fx/ui';

export function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md p-8 text-center space-y-4">
        <h2 className="text-xl font-semibold">No characters yet</h2>
        <p className="text-muted-foreground">
          Your character roster is being synced from Battle.net.
          You can also upload your WoWThing Collector addon data to get started immediately.
        </p>
        <div className="flex gap-2 justify-center">
          <Button asChild>
            <a href="/upload">Upload Addon Data</a>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

### Data Refresh Strategy

| Trigger | Mechanism |
|---------|-----------|
| Initial page load | SSR via TanStack Router `loader` |
| 60s staleness | TanStack Query automatic refetch (`staleTime: 60_000`) |
| Tab focus | TanStack Query refetch on window focus (default) |
| After upload | `queryClient.invalidateQueries({ queryKey: ['dashboard'] })` |
| After manual sync | Same as upload — invalidate dashboard queries |

### WoW Class Colors

Used throughout the app for character name styling.

```typescript
// src/lib/wow/classes.ts
export const CLASS_COLORS: Record<number, { name: string; color: string }> = {
  1:  { name: 'Warrior',      color: '#C79C6E' },
  2:  { name: 'Paladin',      color: '#F58CBA' },
  3:  { name: 'Hunter',       color: '#ABD473' },
  4:  { name: 'Rogue',        color: '#FFF569' },
  5:  { name: 'Priest',       color: '#FFFFFF' },
  6:  { name: 'Death Knight', color: '#C41E3A' },
  7:  { name: 'Shaman',       color: '#0070DE' },
  8:  { name: 'Mage',         color: '#69CCF0' },
  9:  { name: 'Warlock',      color: '#9482C9' },
  10: { name: 'Monk',         color: '#00FF96' },
  11: { name: 'Druid',        color: '#FF7D0A' },
  12: { name: 'Demon Hunter', color: '#A330C9' },
  13: { name: 'Evoker',       color: '#33937F' },
};
```

## Tasks

- [x] @fx/ui integration and shared utilities
  - [x] Verify @fx/ui component API surface (Card compound components, Tooltip API)
  - [x] Create `src/lib/utils.ts` — `cn()` helper, `ActivityState` type, `STATE_CLASSES` / `CELL_COLORS` maps, `getActivityState()` function
  - [x] Create `src/lib/wow/classes.ts` — `CLASS_COLORS` record for all 13 WoW classes
  - [x] Create `src/hooks/useMediaQuery.ts` — responsive breakpoint hook
  - [x] Create `src/hooks/useResetTimer.ts` — countdown timer hook with 1s interval
  - [x] Create `src/hooks/useCollapsedColumns.ts` — localStorage-backed collapsed column state
- [x] Matrix grid system (desktop)
  - [x] Implement `src/components/dashboard/MatrixGrid.tsx` — shared wrapper with sticky first column, horizontal scroll, per-character column collapse toggle
  - [x] Implement `src/components/dashboard/StatusCell.tsx` — dense colored indicator cell with tooltip
  - [x] Verify horizontal scroll + sticky column behavior with 10+ character columns
- [x] Root layout and navigation
  - [x] Implement `src/routes/__root.tsx` — html/head/body shell with `<Nav />` and `<Outlet />`
  - [x] Implement `src/components/layout/Nav.tsx` — sticky nav bar with app name, reset timers (desktop), theme toggle, user dropdown (Sync Now, Upload, Logout)
  - [x] Implement `src/components/layout/ResetTimers.tsx` — daily/weekly countdown badges using `useResetTimer`
  - [ ] Wire theme toggle using @fx/ui's built-in dark/light mode support
  - [x] Handle mobile nav layout (reset timers below nav bar, Sheet for menu if needed)
- [x] Login page
  - [x] Implement `src/routes/login.tsx` — centered Card with Battle.net login Button linking to `/api/auth/signin/battlenet`
- [x] Dashboard route and data loading
  - [x] Implement `src/routes/index.tsx` — loader calling `getDashboardData()`, `staleTime: 60_000` (auth handled by server middleware)
  - [x] Implement `src/components/dashboard/Dashboard.tsx` — top-level component that switches between `DesktopDashboard` (with collapse state) and mobile placeholder at 768px
  - [x] Implement `src/components/dashboard/EmptyState.tsx` — shown when no characters exist, links to upload page
- [x] Shared components
  - [x] Implement `src/components/shared/CharacterName.tsx` — character name with class color styling
- [x] Dashboard Section: Great Vault
  - [x] Implement `src/components/dashboard/VaultSection.tsx` — MatrixGrid with M+/Raid/World rows
  - [x] Implement `VaultDots` sub-component — 3 compact dots per tier with Tooltip showing progress and ilvl
  - [x] Implement `VaultRow` sub-component — renders one vault type across all characters, respects collapsed state
- [x] Dashboard Section: Weekly Checklist
  - [x] Implement `src/components/dashboard/WeeklyChecklist.tsx` — MatrixGrid with activity rows × character StatusCells
  - [x] Implement `resolveActivityStatus` — resolves completion from quest_completions, handles threshold counts and account-wide status
  - [x] Filter out vault/currency/lockout activities (they have dedicated sections)
- [x] Dashboard Section: Dawncrest Currency Caps
  - [x] Implement `src/components/dashboard/CrestTracker.tsx` — MatrixGrid with 5 tier rows, StatusCells showing `qty` label
  - [x] Wire currency IDs (3383, 3341, 3343, 3345, 3348) to character currency data
- [x] Dashboard Section: Keystone Display
  - [x] Implement `src/components/dashboard/KeystoneDisplay.tsx` — compact display of current keystone dungeon + level per character
  - [x] Hide section entirely if no characters have keystones
- [x] Dashboard Section: Renown
  - [x] Implement `src/components/dashboard/RenownSection.tsx` — 4 faction Progress bars (Silvermoon Court, Amani Tribe, Hara'ti, Singularity) showing level/20
  - [x] Hide section if no renown data exists
- [x] Dashboard Section: Raid Lockouts
  - [x] Implement `src/components/dashboard/LockoutGrid.tsx` — MatrixGrid with raid×difficulty rows, StatusCells showing `killed/total`
  - [x] Wire raid instance IDs (16340, 16531, 16215) and difficulty mapping
  - [x] Only show rows where at least one character has a lockout; hide entire section if no lockouts
- [x] Dashboard Section: Daily Activities
  - [x] Implement `src/components/dashboard/DailySection.tsx` — list of daily activities with descriptions
- [x] Upload page
  - [x] Implement `src/routes/upload.tsx` — auth-guarded route with drag-and-drop zone
  - [x] Handle file validation (`.lua` extension check), drag states, upload status (idle/uploading/done/error)
  - [x] Call `uploadAddonData` server function, show character count on success
  - [x] Invalidate dashboard queries on successful upload (`queryClient.invalidateQueries`)
- [x] Mobile responsive layout (per-activity cards)
  - [x] Implement `src/components/dashboard/MobileDashboard.tsx` — per-activity Card layout with character rows inside each card
  - [x] Implement `MobileCharacterRow` — shared row component (class-colored name left, status right)
  - [x] Implement mobile activity cards: `MobileVaultCard`, `MobileWeeklyCard`, `MobileCrestCard`, `MobileKeystoneCard`, `MobileLockoutCard`, `MobileDailyCard`
  - [x] Wire `Dashboard.tsx` to switch between desktop MatrixGrid and mobile activity cards at 768px breakpoint

## Open Questions

1. **Empty vault/lockout display** — Before addon upload, should sections show placeholder state or be hidden? Recommend: show with placeholder ("Upload addon data to see vault progress").

2. **Card sub-components** — Need to verify @fx/ui exports `Card.Header`, `Card.Title`, `Card.Content` compound components vs flat `CardHeader`, `CardTitle`, `CardContent` exports.

## References

- [docs/poc.md](../poc.md) — Section 10 (Frontend Design), Section 11 (Reset Timer System), Section 8 (Upload UI)
- [@fx/ui](https://github.com/fx/ui) — Component library v0.0.0-28fe5ad
- [TanStack Router docs](https://tanstack.com/router/latest)
- [TanStack Query docs](https://tanstack.com/query/latest)
- [TanStack Start docs](https://tanstack.com/start/latest)
