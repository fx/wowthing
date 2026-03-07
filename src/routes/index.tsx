import { createFileRoute } from '@tanstack/react-router';
import { getDashboardData } from '~/server/functions/activities';
import { Dashboard } from '~/components/dashboard/Dashboard';

export const Route = createFileRoute('/')({
  loader: () => getDashboardData(),
  staleTime: 60_000,
  component: function DashboardPage() {
    const data = Route.useLoaderData();
    return <Dashboard {...data} />;
  },
});
