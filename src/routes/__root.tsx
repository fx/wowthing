import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@tanstack/react-router';
import globalCssUrl from '~/global.css?url';
import { Nav } from '~/components/layout/Nav';

export const Route = createRootRoute({
  component: RootLayout,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'WoWThing' },
    ],
    links: [
      { rel: 'stylesheet', href: globalCssUrl },
    ],
  }),
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <Nav />
        <main className="container mx-auto px-4 py-6 max-w-7xl">
          <Outlet />
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
