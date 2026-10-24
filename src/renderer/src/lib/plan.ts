// src/renderer/src/lib/plan.ts
// What an agent's plan looks like to its owner. Only personal and private agents are gated by a plan; a public agent has none.
export const EXPIRING_SOON_DAYS = 7;

export type PlanTone = 'green' | 'brass' | 'red' | 'neutral';

export function planLine(periodEnd: string | null, visibility: string, now = Date.now()): { text: string; tone: PlanTone; needsAttention: boolean } {
  if (visibility === 'public') return { text: 'No plan needed', tone: 'neutral', needsAttention: false };
  if (!periodEnd) return { text: 'No plan yet', tone: 'red', needsAttention: true };
  const end = new Date(periodEnd).getTime();
  if (end <= now) return { text: 'Plan ended', tone: 'red', needsAttention: true };
  const days = Math.ceil((end - now) / 86_400_000);
  return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: days <= EXPIRING_SOON_DAYS ? 'brass' : 'green', needsAttention: days <= EXPIRING_SOON_DAYS };
}
