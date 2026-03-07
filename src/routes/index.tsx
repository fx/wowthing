import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div>
      <h1>WoWThing</h1>
      <p>Midnight Activity Tracker</p>
    </div>
  );
}
