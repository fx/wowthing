import { createFileRoute } from '@tanstack/react-router';
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
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
      }}
    >
      <h1>WoWThing</h1>
      <p>Sign in to track your Midnight activities</p>
      <button
        type="button"
        onClick={handleLogin}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#0074e0',
          color: '#fff',
          borderRadius: '0.375rem',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '1rem',
        }}
      >
        Login with Battle.net
      </button>
    </main>
  );
}
