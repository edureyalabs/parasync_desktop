// src/renderer/src/lib/types.ts
export type Visibility = 'personal' | 'private' | 'public';
export type NetworkStatus = 'active' | 'paused';

export interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  visibility: Visibility;
  avatarUrl: string | null;
  isOwner: boolean;
  networkStatus?: NetworkStatus;
}

export interface MessageAttachment {
  path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'task';
  content: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  created_at: string;
  metadata: { source?: string; kind?: string; attachments?: MessageAttachment[] } | null;
  private?: boolean | null;
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string | null;
  org_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface MyInvite {
  id: string;
  agent_id: string;
  status: 'pending' | 'redeemed' | 'revoked' | 'rejected';
  created_at: string;
  redeemed_at: string | null;
  agent_name: string;
  org_name: string;
}
