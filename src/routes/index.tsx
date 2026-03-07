import { createFileRoute, redirect } from '@tanstack/react-router';
import { getDashboardData } from '~/server/functions/activities';
import { Dashboard } from '~/components/dashboard/Dashboard';
import { authClient } from '~/lib/auth/client';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (!session) throw redirect({ to: '/login' });
  },
  loader: () => getDashboardData(),
  staleTime: 60_000,
  component: function DashboardPage() {
    const data = Route.useLoaderData();
    return <Dashboard {...data} />;
  },
});
