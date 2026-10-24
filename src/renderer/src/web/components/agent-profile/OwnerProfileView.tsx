// components/agent-profile/OwnerProfileView.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAgentCtx } from '@/app/(shell)/agents/[id]/layout';
import { createClient } from '@/lib/supabase/client';
import { Btn, Chip, Spinner } from '@/components/account/ui';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { AgentPage } from '@/components/agent-ui/AgentPage';
import { AgentSummaryPanel } from './AgentSummaryPanel';
import { ProfileHero } from './ProfileHero';
import { SectionCard, UI_CSS } from './ui';
import { UsageCard } from './UsageCard';
import { resizeImageToWebp } from './avatarImage';
import { DeleteAgentModal } from './DeleteAgentModal';
import { Field, PROFILE_FIELD_CSS, Switch } from './ProfileFields';
import { useAgentSummary } from './useAgentSummary';

// The owner's Agent Profile: who the agent is (identity), how it behaves (persona), whether it is available, how it is
// billed, plus a side panel with everything else worth knowing about it. Edits are held until Save; a bar appears while
// there is something to save.

const NAME_MAX = 60;
const BIO_MAX = 160;

const BILLING_COPY = {
  personal: 'Charged to your balance. Only you and your organization use this agent.',
  private: 'Everyone you connect to this agent is charged to your balance, not theirs. See who uses it, and how much, under Add Users.',
  public_owner: 'Everyone who adds this agent is charged to your balance.',
  public_user: 'Each person who adds this agent pays for their own usage.',
} as const;

interface Form { name: string; bio: string; description: string; backstory: string; role: string; goal: string; active: boolean }

function formFrom(agent: { name: string; bio: string | null; description: string | null; backstory: string | null; role: string | null; goal: string | null; active: boolean }): Form {
  return { name: agent.name ?? '', bio: agent.bio ?? '', description: agent.description ?? '', backstory: agent.backstory ?? '', role: agent.role ?? '', goal: agent.goal ?? '', active: agent.active ?? false };
}

export function OwnerProfileView() {
  const router = useRouter();
  const { agent, agentId, setAgent, orgName } = useAgentCtx();
  const { summary, loading: summaryLoading } = useAgentSummary(agentId, agent?.visibility);

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the form once per agent. Re-syncing on every agent change would wipe edits (a photo change updates the agent).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!agent || loadedFor.current === agent.id) return;
    loadedFor.current = agent.id;
    setForm(formFrom(agent));
  }, [agent]);

  const dirty = useMemo(() => {
    if (!agent || !form) return false;
    const base = formFrom(agent);
    return (Object.keys(base) as (keyof Form)[]).some(k => (typeof base[k] === 'string' ? (base[k] as string).trim() !== (form[k] as string).trim() : base[k] !== form[k]));
  }, [agent, form]);

  if (!agent || !form) return <AgentPage eyebrow="Agent profile" title="Agent profile"><div style={{ minHeight: '40vh' }} /></AgentPage>;

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => { setForm(p => (p ? { ...p, [key]: value } : p)); setSaved(false); setError(''); };

  const save = async () => {
    if (!form.name.trim()) { setError('The agent needs a name.'); return; }
    setSaving(true); setError('');
    const patch = {
      name: form.name.trim(), bio: form.bio.trim() || null, description: form.description.trim() || null,
      backstory: form.backstory.trim() || null, role: form.role.trim() || null, goal: form.goal.trim() || null, active: form.active,
    };
    const { error: dbErr } = await createClient().from('agents').update(patch).eq('id', agentId);
    setSaving(false);
    if (dbErr) { setError('Could not save. Please try again.'); return; }
    setAgent(prev => (prev ? { ...prev, ...patch } : prev));    // the header and sidebar show the new name at once
    setForm(formFrom({ ...agent, ...patch }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const discard = () => { setForm(formFrom(agent)); setError(''); setSaved(false); };

  const deleteAgent = async () => {
    const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    router.replace('/agents');
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setAvatarError('That image is too large. The limit is 10MB.'); return; }
    setAvatarBusy(true); setAvatarError('');
    try {
      const blob = await resizeImageToWebp(file);
      const supabase = createClient();
      const path = `${agent.org_id}/${agentId}/avatar.webp`;
      const { error: upErr } = await supabase.storage.from('agent-avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('agent-avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from('agents').update({ avatar_url: url }).eq('id', agentId);
      if (dbErr) throw dbErr;
      setAgent(prev => (prev ? { ...prev, avatar_url: url } : prev));
    } catch {
      setAvatarError('Could not upload that image. Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removePhoto = async () => {
    setAvatarBusy(true); setAvatarError('');
    const { error: dbErr } = await createClient().from('agents').update({ avatar_url: null }).eq('id', agentId);
    setAvatarBusy(false);
    if (dbErr) { setAvatarError('Could not remove the photo. Please try again.'); return; }
    setAgent(prev => (prev ? { ...prev, avatar_url: null } : prev));
  };

  const visibility = agent.visibility;
  const billing = visibility === 'personal' ? BILLING_COPY.personal : visibility === 'private' ? BILLING_COPY.private : agent.billing_mode === 'owner_pays' ? BILLING_COPY.public_owner : BILLING_COPY.public_user;
  const kindChip = visibility === 'personal' ? <Chip>Personal</Chip> : visibility === 'private' ? <Chip tone="brass">Private</Chip> : agent.is_verified ? <Chip tone="green" dot>Public · verified</Chip> : <Chip tone="amber" dot>Public · in review</Chip>;

  return (
    <AgentPage eyebrow="Agent profile" title="Agent profile" subtitle="Who this agent is, how it behaves, how much it has used and whether it is available." maxWidth={1220}>
      <style>{PROFILE_FIELD_CSS + UI_CSS}</style>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void pickPhoto(e)} style={{ display: 'none' }} />

      <div style={{ marginBottom: '1.25rem' }}>
        <ProfileHero
          name={agent.name} bio={agent.bio} handle={agent.handle} orgName={orgName} avatarUrl={agent.avatar_url} kind={kindChip} active={agent.active}
          summary={summary} summaryLoading={summaryLoading} busy={avatarBusy} error={avatarError}
          onChangePhoto={() => fileRef.current?.click()} onRemovePhoto={() => void removePhoto()}
        />
      </div>

      <div className="ap-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          <SectionCard icon="id-card" color={C.slate} title="Identity" description="How the agent appears wherever people see it. Nobody sees which organization created it.">
            <Field id="ap-name" label="Name" value={form.name} onChange={set('name')} placeholder="e.g. Support Agent" maxLength={NAME_MAX} />
            <Field id="ap-bio" label="Bio" value={form.bio} onChange={set('bio')} rows={2} maxLength={BIO_MAX}
              placeholder="A short line shown under the name in the chat header and My Agents."
              hint="Shown in the chat header and in My Agents, in place of an organization name." />
            <Field id="ap-desc" label="Description" value={form.description} onChange={set('description')} rows={3}
              placeholder="What this agent does, in a few sentences."
              hint="Shown on the Marketplace and on the profile people see after connecting." />
          </SectionCard>

          <SectionCard icon="sparkles" color="#5F4A8C" title="Persona" description="How the agent thinks and behaves. This shapes every answer it gives.">
            <Field id="ap-role" label="Role" value={form.role} onChange={set('role')} placeholder="e.g. Senior Customer Support Specialist" hint="The job title this agent holds." />
            <Field id="ap-goal" label="Goal" value={form.goal} onChange={set('goal')} rows={2} placeholder="e.g. Resolve customer issues quickly and kindly" hint="What it is trying to achieve in every conversation." />
            <Field id="ap-backstory" label="Backstory" value={form.backstory} onChange={set('backstory')} rows={7}
              placeholder="You are a seasoned specialist at Acme Corp…"
              hint="Used as the agent's base instructions. Write it in the second person: “You are…”. Add rules and reusable know-how under Instructions." />
          </SectionCard>

          <SectionCard icon="power" color={C.green} title="Availability and billing" description="Whether the agent is on, and who pays for what it does.">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.25rem' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.86rem', fontWeight: 500, color: C.ink, margin: 0 }}>Agent is active</p>
                <p style={{ fontSize: '0.76rem', color: C.soft, margin: '0.25rem 0 0', lineHeight: 1.55 }}>
                  {form.active ? 'People with access can chat with it, and its tasks and shifts run.' : 'Switched off: it won’t answer messages and nothing new starts (tasks, scheduled runs, shifts or planning). Nothing is deleted, and scheduled runs missed in the meantime aren’t made up.'}
                </p>
                {!form.active && agent.active && (
                  <p role="status" style={{ fontSize: '0.76rem', color: C.red, background: C.redWash, border: `1px solid ${C.redLine}`, borderRadius: 8, padding: '0.5rem 0.7rem', margin: '0.6rem 0 0', lineHeight: 1.55 }}>
                    Saving this stops anything new from starting. A task that is already running finishes; a shift that is running ends at its next wake, and its owner is told.
                  </p>
                )}
              </div>
              <Switch checked={form.active} onChange={set('active')} label="Agent is active" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', borderTop: `1px solid ${C.lineSoft}`, margin: '1.1rem 0 0.9rem', paddingTop: '1rem' }}>
              <span style={{ color: C.muted, marginTop: 2 }}><Icon name="wallet" size={15} /></span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 0.3rem' }}>Who pays for usage</p>
                <p style={{ fontSize: '0.78rem', color: C.body, margin: 0, lineHeight: 1.65 }}>
                  {billing} <a href="/account/billing" style={{ color: C.soft, textDecoration: 'underline' }}>Billing</a>
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Appears while there is something to save, and stays in view */}
          {(dirty || saved || error) && (
            <div style={{ position: 'sticky', bottom: '1rem', zIndex: 5, background: '#fff', border: `1px solid ${error ? C.redLine : C.line}`, borderRadius: 12, boxShadow: '0 10px 30px -12px rgba(38,37,30,0.3)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span role={error ? 'alert' : 'status'} style={{ flex: 1, minWidth: 160, fontSize: '0.8rem', color: error ? C.red : saved && !dirty ? C.green : C.soft }}>
                {error || (saved && !dirty ? 'Saved ✓' : 'You have unsaved changes')}
              </span>
              <Btn onClick={discard} disabled={saving || !dirty}>Discard</Btn>
              <Btn variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
                {saving && <Spinner size={14} color="#fff" />}
                {saving ? 'Saving…' : 'Save changes'}
              </Btn>
            </div>
          )}

          <div style={{ background: '#FCF7F5', border: `1px solid ${C.redLine}`, borderRadius: 12, padding: '1.1rem 1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.red, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>Danger zone</p>
                <p style={{ fontSize: '0.84rem', color: C.ink, margin: 0 }}>Delete this agent</p>
                <p style={{ fontSize: '0.74rem', color: C.soft, margin: '0.2rem 0 0', lineHeight: 1.55 }}>Permanently removes its chats, tools, instructions, secrets and workspace files.</p>
              </div>
              <Btn onClick={() => setDeleteOpen(true)} style={{ color: C.red, borderColor: C.redLine }}>Delete agent</Btn>
            </div>
          </div>
        </div>

        <aside className="ap-side" aria-label="Usage and overview" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <UsageCard agentId={agentId} visibility={visibility} owner />
          <AgentSummaryPanel agentId={agentId} visibility={visibility} summary={summary} loading={summaryLoading} />
        </aside>
      </div>

      {deleteOpen && <DeleteAgentModal agentName={agent.name} onClose={() => setDeleteOpen(false)} onConfirm={deleteAgent} />}
    </AgentPage>
  );
}
