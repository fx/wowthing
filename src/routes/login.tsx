import { createFileRoute } from '@tanstack/react-router';
import { Button, Card, CardContent } from '@fx/ui';
import { authClient } from '~/lib/auth/client';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const handleLogin = () => {
    authClient.signIn.oauth2({
      providerId: 'battlenet',
      callbackURL: '/',
    });
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="p-8 text-center space-y-6">
          <h1 className="text-3xl font-bold">WoWThing</h1>
          <p className="text-muted-foreground">
            Track your Midnight weekly and daily activities
          </p>
          {/* @ts-expect-error -- @fx/ui Button accepts children at runtime; Base UI types omit it */}
          <Button size="lg" className="w-full" onClick={handleLogin}>
            Login with Battle.net
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
