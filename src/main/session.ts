// src/main/session.ts
// Who is signed in, as far as the main process is concerned. The page tells the main process when the person signs in or out
// (runner/index.ts validates it); anything that works on one person's data asks here instead of trusting an id sent by the page.
let current: string | null = null;

export function setSessionUser(userId: string | null): void {
  current = userId;
}

export function sessionUser(): string | null {
  return current;
}

export function requireSessionUser(): string {
  if (!current) throw new Error('not signed in');
  return current;
}

// The signed-in person's access token, kept in memory only (never written anywhere). The page pushes a fresh one whenever it renews.
let accessToken: string | null = null;

export function setSessionToken(token: string | null): void {
  accessToken = token;
}

export function sessionToken(): string {
  if (!accessToken) throw new Error('not signed in');
  return accessToken;
}
