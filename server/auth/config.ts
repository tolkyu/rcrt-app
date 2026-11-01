import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Invalid Supabase auth configuration: ${name}`);
  return value;
}

export function supabaseAuthConfig() {
  return {
    url: required('SUPABASE_URL'),
    publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  };
}

/** The secret key never leaves server code; it is only read by the admin client. */
export function supabaseSecretKey(): string {
  return required('SUPABASE_SECRET_KEY');
}

/** Google stays hidden unless the provider is configured on the Auth server and here (SEC-AUTH-2). */
export function googleSignInEnabled(): boolean {
  return process.env.AUTH_GOOGLE_ENABLED === 'true';
}
