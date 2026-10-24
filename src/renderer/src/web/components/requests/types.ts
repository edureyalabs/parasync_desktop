// components/requests/types.ts
export interface MyInvite {
  id: string;
  agent_id: string;
  status: 'pending' | 'redeemed' | 'revoked' | 'rejected';
  created_at: string;
  redeemed_at: string | null;
  agent_name: string;
  org_name: string;
}
