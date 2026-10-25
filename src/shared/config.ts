// src/shared/config.ts
// Public, non-secret settings. The Supabase publishable key is designed to ship in clients (the web app and the
// phone app embed the same one); what protects data is row-level security, never this key. Never put a service-role
// key, a Fernet key or any provider key in this app.
export const APP_CONFIG = {
  supabaseUrl: 'https://eyufwzhxxfebncwaxgci.supabase.co',
  supabasePublishableKey: 'sb_publishable_nu3OggC4tEM85yobhHg5YQ__A-1X34u',
  /**
   * The web app, for things the desktop app does not do yet ("Open in web") and the address every /api call goes to.
   * Must be the www address: parasync.in answers with a 308 redirect to www.parasync.in, and webApi.ts refuses redirects
   * (it would otherwise carry the login token to wherever the redirect points), so the bare address makes every call fail.
   */
  webUrl: 'https://www.parasync.in',
  /** Deep link the system browser returns to after Google sign-in. Must be an allowed redirect URL in Supabase. */
  protocol: 'parasync',
  authCallback: 'parasync://auth/callback',
  /**
   * Where Google sign-in returns to. 'deep-link' goes straight to parasync://auth/callback (works today; the browser shows an
   * "open app" prompt on a blank page). 'web-bridge' goes through https://parasync.in/auth/desktop, a branded page that opens the
   * app and says "you can close this tab". Switch to 'web-bridge' ONLY after https://parasync.in/auth/desktop (and the www
   * address) are listed under Supabase > Authentication > URL Configuration > Redirect URLs, or Google sign-in will not return to the app.
   */
  googleReturn: 'web-bridge' as 'deep-link' | 'web-bridge',
  bridgePath: '/auth/desktop',
  /** Host of the sign-in return page. Kept on the bare address because that is the one already listed in Supabase's Redirect URLs. */
  bridgeBase: 'https://parasync.in',
  /** Hosts the app may open in the system browser for sign-in (Supabase's own host and Google). */
  oauthHosts: ['eyufwzhxxfebncwaxgci.supabase.co', 'accounts.google.com'],
} as const;
