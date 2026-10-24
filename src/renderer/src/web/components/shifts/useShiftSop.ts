// components/shifts/useShiftSop.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SopVersion } from './types';

// A shift's SOP versions (shift_sops), newest first, live while the agent writes. The current SOP is the first one.
// RLS lets the org's owner/admin read them; the agent in bemain is the only writer.
export function useShiftSop(shiftId: string, enabled: boolean): { versions: SopVersion[]; loading: boolean } {
  const [versions, setVersions] = useState<SopVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pull = async () => {
      const { data } = await createClient().from('shift_sops').select('*').eq('shift_id', shiftId).order('version', { ascending: false }).limit(40);
      if (!cancelled) { setVersions((data as SopVersion[] | null) ?? []); setLoading(false); }
    };
    void (async () => { await pull(); })();
    const supabase = createClient();
    const channel = supabase
      .channel(`shift-sop:${shiftId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shift_sops', filter: `shift_id=eq.${shiftId}` }, () => { void pull(); })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [shiftId, enabled]);

  return { versions, loading };
}
