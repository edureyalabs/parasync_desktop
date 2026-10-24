// src/renderer/src/lib/nav.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Section = 'agents' | 'discover' | 'requests' | 'account';

interface NavCtx {
  section: Section;
  agentId: string | null;
  /** The open agent's settings tab (profile, tools, ...), or null while its chat is showing. */
  agentTab: string | null;
  go: (section: Section) => void;
  openAgent: (id: string | null) => void;
  openAgentTab: (tab: string | null) => void;
}

const NavContext = createContext<NavCtx | null>(null);

export function useNav(): NavCtx {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside NavProvider');
  return ctx;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<Section>('agents');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentTab, setAgentTab] = useState<string | null>(null);

  const go = useCallback((next: Section) => setSection(next), []);
  const openAgent = useCallback((id: string | null) => {
    setAgentId(id);
    setAgentTab(null); // opening an agent always starts at its chat
    if (id) setSection('agents');
  }, []);
  const openAgentTab = useCallback((tab: string | null) => setAgentTab(tab), []);

  const value = useMemo(() => ({ section, agentId, agentTab, go, openAgent, openAgentTab }), [section, agentId, agentTab, go, openAgent, openAgentTab]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
