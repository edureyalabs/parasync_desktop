// src/renderer/src/lib/readState.ts
// "Unread" is local to this PC: remember when each chat was last opened. Wiped on sign-out.
const PREFIX = 'parasync:lastRead:';

export function markRead(agentId: string): void {
  try {
    localStorage.setItem(PREFIX + agentId, new Date().toISOString());
  } catch {
    /* unread dots are cosmetic */
  }
}

export function getLastRead(agentIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const id of agentIds) {
      const v = localStorage.getItem(PREFIX + id);
      if (v) out[id] = v;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function clearLocalData(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('parasync:')) localStorage.removeItem(key);
  } catch {
    /* best effort: nothing sensitive lives here */
  }
}
