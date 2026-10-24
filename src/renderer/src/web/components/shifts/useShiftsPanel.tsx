// components/shifts/useShiftsPanel.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from './ConfirmModal';
import { replanShift } from './planActions';
import ShiftCard from './ShiftCard';
import ShiftRunModal from './ShiftRunModal';
import { INK, SOFT } from './tokens';
import type { Shift, ShiftRun } from './types';
import { useShiftHistory } from './useShiftHistory';
import { useShifts } from './useShifts';

// An item of the Runsheet's Active list, ordered together with the tasks around it:
// rank 0 = working now, 1 = planning / waiting to be planned, 2 = scheduled (then by `at`), 3 = needs attention.
export interface ShiftActiveEntry { key: string; rank: number; at: number; node: React.ReactNode }

// Everything the Runsheet needs from the shift system, so shifts and tasks can share one list and one History:
// the shift cards for the Active list, finished runs for History, and the run/terminate/retire dialogs.
export function useShiftsPanel(agentId: string, enabled: boolean) {
  const { items, reload } = useShifts(agentId);
  const history = useShiftHistory(agentId, enabled, items.map(i => i.shift.id), items);
  const [viewing, setViewing] = useState<{ shift: Shift; runId: string } | null>(null);
  const [terminating, setTerminating] = useState<Shift | null>(null);
  const [retiring, setRetiring] = useState<Shift | null>(null);

  const terminate = async (shift: Shift): Promise<string | null> => {
    const resp = await fetch(`/api/shifts/${shift.id}/terminate`, { method: 'POST' }).catch(() => null);
    if (!resp || !resp.ok) return 'Could not terminate the run. Please try again.';
    await reload();
    return null;
  };

  const retire = async (shift: Shift): Promise<string | null> => {
    // Stop any run in progress first (best effort), then retire. bemain also stops a retired shift's run on its next sweep.
    await fetch(`/api/shifts/${shift.id}/terminate`, { method: 'POST' }).catch(() => null);
    const { error } = await createClient().from('shifts').update({ status: 'cancelled', retired_at: new Date().toISOString() }).eq('id', shift.id);
    if (error) return 'Something went wrong. Please try again.';
    await reload();
    return null;
  };

  const replan = async (shift: Shift) => {
    await replanShift(shift.id);
    await reload();
  };

  const activeEntries: ShiftActiveEntry[] = !enabled ? [] : items
    .filter(i => i.shift.status !== 'cancelled')
    .map(({ shift, activeRun }) => {
      const planning = shift.status === 'pending' || shift.status === 'planning';
      const next = shift.next_start_at ? new Date(shift.next_start_at).getTime() : Number.MAX_SAFE_INTEGER;
      return {
        key: `shift-${shift.id}`,
        rank: activeRun ? 0 : planning ? 1 : shift.status === 'failed' ? 3 : 2,
        at: next,
        node: (
          <ShiftCard
            shift={shift} activeRun={activeRun}
            onView={runId => setViewing({ shift, runId })}
            onTerminate={() => setTerminating(shift)} onRetire={() => setRetiring(shift)} onReplan={() => void replan(shift)}
          />
        ),
      };
    });

  const shiftById = (id: string): Shift | null => items.find(i => i.shift.id === id)?.shift ?? null;
  const openRun = (run: ShiftRun) => {
    const shift = shiftById(run.shift_id);
    if (shift) setViewing({ shift, runId: run.id });
  };

  const dialogs = (
    <>
      {viewing && <ShiftRunModal shift={viewing.shift} initialRunId={viewing.runId} onClose={() => setViewing(null)} onTerminate={s => setTerminating(s)} />}
      {terminating && (
        <ConfirmModal
          title="Terminate today’s run?"
          body={<>The agent stops working on <strong style={{ color: INK, fontWeight: 500 }}>{terminating.name}</strong> right now and today’s run closes without a report. The shift itself stays and starts again at its next window.</>}
          confirmLabel="Terminate run" keepLabel="Keep running"
          onConfirm={() => terminate(terminating)} onClose={() => setTerminating(null)}
        />
      )}
      {retiring && (
        <ConfirmModal
          title="Retire this shift?"
          body={<><strong style={{ color: INK, fontWeight: 500 }}>{retiring.name}</strong> will not run again<span style={{ color: SOFT }}> and any run in progress is ended</span>. Its past runs and reports stay in History.</>}
          confirmLabel="Retire shift" keepLabel="Keep shift"
          onConfirm={() => retire(retiring)} onClose={() => setRetiring(null)}
        />
      )}
    </>
  );

  return { activeEntries, history, shiftById, openRun, dialogs };
}
