// lib/api.ts
export async function getSession() {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    const data = await res.json();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string) {
  try {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Sign in failed. Please try again.' };
    return { user: data.user };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

export async function signUp(email: string, password: string) {
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Sign up failed. Please try again.' };
    return { user: data.user, requiresConfirmation: data.requiresConfirmation, alreadyRegistered: data.alreadyRegistered };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

export async function forgotPassword(email: string) {
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Request failed. Please try again.' };
    return { success: true };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}

export function signInWithGoogle() {
  window.location.href = '/api/auth/google';
}

export async function signOut() {
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
  } catch {
    // ignore
  }
}

export async function updatePassword(password: string) {
  try {
    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Update failed' };
    return { success: true };
  } catch {
    return { error: 'Network error. Please try again.' };
  }
}