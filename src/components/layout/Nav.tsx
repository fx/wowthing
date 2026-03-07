import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@fx/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { ResetTimers } from './ResetTimers';
import { TypedButton } from '~/components/shared/TypedButton';
import { useMediaQuery } from '~/hooks/useMediaQuery';
import { authClient } from '~/lib/auth/client';
import { getNextDailyReset, getNextWeeklyReset } from '~/lib/activities/resets';
import { triggerSync } from '~/server/functions/sync';

export function Nav() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();

  const handleSync = async () => {
    await triggerSync();
  };

  const handleLogout = async () => {
    await authClient.signOut();
    window.location.href = '/login';
  };

  const handleUpload = () => {
    navigate({ to: '/upload' as string });
  };

  const nextWeeklyReset = getNextWeeklyReset('us').toISOString();
  const nextDailyReset = getNextDailyReset('us').toISOString();

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
                <TypedButton variant="ghost" size="sm">
                  {session.user.name ?? 'Account'}
                </TypedButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleSync}>
                  Sync Now
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleUpload}>
                  Upload Addon Data
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
