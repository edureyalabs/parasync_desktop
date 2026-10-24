// src/shared/config.ts
// Public, non-secret settings. The Supabase publishable key is designed to ship in clients (the web app and the
// phone app embed the same one); what protects data is row-level security, never this key. Never put a service-role
// key, a Fernet key or any provider key in this app.
export const APP_CONFIG = {
  supabaseUrl: 'https://eyufwzhxxfebncwaxgci.supabase.co',
  supabasePublishableKey: 'sb_publishable_nu3OggC4tEM85yobhHg5YQ__A-1X34u',
  /** The web app, for things the desktop app does not do yet ("Open in web"). */
  webUrl: 'https://parasync.in',
  /** Deep link the system browser returns to after Google sign-in. Must be an allowed redirect URL in Supabase. */
  protocol: 'parasync',
  authCallback: 'parasync://auth/callback',
  /** Hosts the app may open in the system browser for sign-in (Supabase's own host and Google). */
  oauthHosts: ['eyufwzhxxfebncwaxgci.supabase.co', 'accounts.google.com'],
} as const;
