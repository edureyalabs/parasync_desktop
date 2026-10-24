// app/(shell)/account/organizations/types.ts

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string | null;
  created_at: string;
}

// Only personal/private agents carry a subscription (public isn't creatable today --
// see SubscribeAgentModal's MONTHLY_RATE_USD, which has no 'public' entry).
export interface OrgAgent {
  id: string;
  name: string;
  visibility: string;
  current_period_end: string | null;
}

export type OrgDraft = { name: string; description: string; timezone: string | null };
