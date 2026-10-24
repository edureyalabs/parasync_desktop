// components/shifts/planActions.ts
// The owner's ways of getting a shift (re)planned: plan it again from its definition, or ask for changes to the
// current plan. Both put the shift back to 'pending' and ask bemain to plan it at once (bemain's own sweep would
// pick it up within a minute anyway, so the call is a speed-up). Each returns an error message, or null on success.
import { createClient } from '@/lib/supabase/client';
import type { PlanRequest, Shift } from './types';

export const MAX_REQUEST_CHARS = 2000;
export const MAX_REQUESTS = 20;

async function startPlanning(shiftId: string): Promise<void> {
  await fetch('/api/shifts/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shift_id: shiftId }),
  }).catch(() => undefined);
}

export async function replanShift(shiftId: string): Promise<string | null> {
  const { error } = await createClient().from('shifts').update({ status: 'pending', plan_attempts: 0, last_error: null }).eq('id', shiftId);
  if (error) return error.message;
  void startPlanning(shiftId);
  return null;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export async function requestPlanChanges(shift: Shift, text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return 'Describe the change you want first.';
  if (trimmed.length > MAX_REQUEST_CHARS) return `Keep it under ${MAX_REQUEST_CHARS.toLocaleString()} characters.`;
  const existing = shift.plan_feedback ?? [];
  if (existing.length >= MAX_REQUESTS) return 'This shift already has the most requests it can hold. Remove an older one first.';
  const entry: PlanRequest = { id: newId(), text: trimmed, at: new Date().toISOString(), applied_at: null };
  // Only a shift that is not being planned or run right now: never overwrite a pass that is in flight.
  const { data, error } = await createClient().from('shifts')
    .update({ plan_feedback: [...existing, entry], status: 'pending', plan_attempts: 0, last_error: null })
    .eq('id', shift.id).in('status', ['planned', 'failed']).select('id');
  if (error) return error.message;
  if (!data || data.length === 0) return 'This shift changed while you were writing. Reload and try again.';
  void startPlanning(shift.id);
  return null;
}

/** Removing a request does not replan by itself: it stops applying from the next time the shift is planned. */
export async function removePlanRequest(shift: Shift, requestId: string): Promise<string | null> {
  const next = (shift.plan_feedback ?? []).filter(r => r.id !== requestId);
  const { error } = await createClient().from('shifts').update({ plan_feedback: next }).eq('id', shift.id);
  return error ? error.message : null;
}
