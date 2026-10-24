// app/(shell)/account/organizations/subscription.ts
// What an agent's subscription looks like to its owner. Only personal/private agents are
// gated (bemain's subscriptions.py: GATED_VISIBILITIES); a public agent has no plan to show.

import { MONTHLY_RATE_USD } from './SubscribeAgentModal';
import type { OrgAgent } from './types';

export const EXPIRING_SOON_DAYS = 7;

export type SubState =
  | 'free'      // not a gated tier: nothing to subscribe to
  | 'active'    // paid up, comfortably
  | 'expiring'  // paid up, but the period ends within EXPIRING_SOON_DAYS
  | 'expired'   // had a plan, the period has ended
  | 'none';     // never subscribed

export interface SubInfo {
  state: SubState;
  /** Whole days left (0 on the last day); null when there is no live period. */
  daysLeft: number | null;
  /** Price per month in USD, 0 for a tier with no plan. */
  rate: number;
}

export function isGated(visibility: string): boolean {
  return visibility === 'personal' || visibility === 'private';
}

export function subInfo(agent: Pick<OrgAgent, 'visibility' | 'current_period_end'>, now: number): SubInfo {
  const rate = MONTHLY_RATE_USD[agent.visibility] ?? 0;
  if (!isGated(agent.visibility)) return { state: 'free', daysLeft: null, rate };
  if (!agent.current_period_end) return { state: 'none', daysLeft: null, rate };

  const end = new Date(agent.current_period_end).getTime();
  if (end <= now) return { state: 'expired', daysLeft: null, rate };

  const daysLeft = Math.ceil((end - now) / 86_400_000);
  return { state: daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active', daysLeft, rate };
}

export interface OrgSummary {
  agents: number;
  gated: number;
  active: number;          // gated agents whose plan is live (active or expiring)
  needsAttention: number;  // gated agents that are expiring, expired or never subscribed
  monthlyUsd: number;      // what the live plans cost per month
  nextRenewal: string | null; // soonest period end among live plans
}

export function summarize(agents: OrgAgent[], now: number): OrgSummary {
  let gated = 0, active = 0, needsAttention = 0, monthlyUsd = 0;
  let nextRenewal: string | null = null;
  for (const agent of agents) {
    const info = subInfo(agent, now);
    if (info.state === 'free') continue;
    gated++;
    if (info.state === 'active' || info.state === 'expiring') {
      active++;
      monthlyUsd += info.rate;
      if (agent.current_period_end && (nextRenewal === null || agent.current_period_end < nextRenewal)) nextRenewal = agent.current_period_end;
    }
    if (info.state !== 'active') needsAttention++;
  }
  return { agents: agents.length, gated, active, needsAttention, monthlyUsd, nextRenewal };
}
