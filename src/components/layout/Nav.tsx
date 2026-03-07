import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@fx/ui';
import { Link } from '@tanstack/react-router';
import { ResetTimers } from './ResetTimers';
import { useMediaQuery } from '~/hooks/useMediaQuery';
import { authClient } from '~/lib/auth/client';
import { triggerSync } from '~/server/functions/sync';

export function Nav() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { data: session, isPending } = authClient.useSession();

  const handleSync = async () => {
    await triggerSync();
  };

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.href = '/login';
  };

  // Placeholder reset times — will be replaced with real data from dashboard loader
  const nextWeeklyReset = getNextResetISO('weekly');
  const nextDailyReset = getNextResetISO('daily');

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-14">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-bold text-lg">
            WoWThing
          </Link>
          {!isMobile && (
            <ResetTimers weekly={nextWeeklyReset} daily={nextDailyReset} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isPending && session && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* @ts-expect-error -- @fx/ui Button accepts children at runtime; Base UI types omit it */}
                <Button variant="ghost" size="sm">
                  {session.user.name ?? 'Account'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleSync}>
                  Sync Now
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <a href="/upload">Upload Addon Data</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {isMobile && (
        <div className="px-4 pb-2 flex justify-center">
          <ResetTimers weekly={nextWeeklyReset} daily={nextDailyReset} />
        </div>
      )}
    </nav>
  );
}

function getNextResetISO(type: 'weekly' | 'daily'): string {
  const now = new Date();
  const reset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      15, 0, 0, 0,
    ),
  );

  if (type === 'weekly') {
    // Advance to next Tuesday
    while (reset.getUTCDay() !== 2 || reset <= now) {
      reset.setUTCDate(reset.getUTCDate() + 1);
    }
  } else {
    if (reset <= now) {
      reset.setUTCDate(reset.getUTCDate() + 1);
    }
  }

  return reset.toISOString();
}
