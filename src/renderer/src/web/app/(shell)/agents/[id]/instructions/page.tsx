// app/agents/[id]/instructions/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import ConfirmModal from '@/components/ConfirmModal';
import { EnableToggles } from '@/components/EnableToggles';
import { TabHeader, HeaderButton } from '@/components/agent-ui/TabHeader';

const TITLE_MAX   = 200;
const CONTENT_MAX = 5000;

interface Instruction {
  id:                    string;
  title:                 string;
  content:               string;
  enabled:               boolean;
  available_to_members:  boolean;
  created_at:            string;
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ─── Editor modal (create + edit) ────────────────────────────────────────────────

function InstructionModal({ agentId, existing, onClose, onSaved }: {
  agentId:  string;
  existing: Instruction | null;
  onClose:  () => void;
  onSaved:  (i: Instruction) => void;
}) {
  const [title, setTitle]     = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const titleRef   = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t) { setError('Title is required.'); return; }
    if (!c) { setError('Content is required.'); return; }

    setLoading(true); setError('');
    const supabase = createClient();

    if (existing) {
      const { data, error: dbErr } = await supabase
        .from('instructions')
        .update({ title: t, content: c, enabled })
        .eq('id', existing.id)
        .select()
        .single();
      setLoading(false);
      if (dbErr) { setError('Something went wrong. Please try again.'); return; }
      onSaved(data as Instruction);
    } else {
      const { data, error: dbErr } = await supabase
        .from('instructions')
        .insert({ agent_id: agentId, title: t, content: c, enabled })
        .select()
        .single();
      setLoading(false);
      if (dbErr) { setError('Something went wrong. Please try again.'); return; }
      onSaved(data as Instruction);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeIn 0.15s ease both' }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 520, animation: 'slideUp 0.2s ease both', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              {existing ? 'Edit instruction' : 'New instruction'}
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              {existing ? existing.title : 'Add an instruction'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Title <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              ref={titleRef} className="instr-input" type="text"
              placeholder="e.g. Tone of voice"
              value={title}
              onChange={e => { setTitle(e.target.value.slice(0, TITLE_MAX)); setError(''); }}
              maxLength={TITLE_MAX}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{title.length}/{TITLE_MAX}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Content <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <textarea
              className="instr-input"
              placeholder="Write the policy, knowledge, or guidance this agent should follow…"
              value={content}
              onChange={e => { setContent(e.target.value.slice(0, CONTENT_MAX)); setError(''); }}
              maxLength={CONTENT_MAX}
              rows={8}
              style={{ resize: 'vertical', lineHeight: 1.6 }}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{content.length}/{CONTENT_MAX}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2DFD3', paddingTop: '1rem' }}>
            <div>
              <p style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.65rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 0.2rem' }}>Enabled</p>
              <p style={{ fontSize: '0.75rem', color: '#9E9C8F', margin: 0 }}>
                {enabled ? 'Included in this agent’s prompt.' : 'Saved but not sent to the agent.'}
              </p>
            </div>
            <button
              onClick={() => setEnabled(e => !e)}
              style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', background: enabled ? '#26251E' : '#DAD5C5', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
            >
              <span style={{ position: 'absolute', top: 3, left: enabled ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !content.trim()}
            style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: !title.trim() || !content.trim() ? 0.5 : 1 }}
          >
            {loading && <Spinner />}
            {loading ? 'Saving…' : existing ? 'Save changes' : 'Add instruction'}
          </button>
        </div>
      </div>
      <style>{`
        .instr-input {
          width: 100%; padding: 0.55rem 0.7rem; font-size: 0.875rem;
          font-family: 'Inter', sans-serif; color: #26251E; background: #fff;
          border: 1px solid #DAD5C5; border-radius: 4px; outline: none;
          transition: border-color 0.15s; box-sizing: border-box; line-height: 1.55;
        }
        .instr-input:focus { border-color: #26251E; }
        .instr-input::placeholder { color: #B9B4A2; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Owner view ────────────────────────────────────────────────────────────────

function OwnerInstructionsView() {
  const { agentId, agent } = useAgentCtx();
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Instruction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Instruction | null>(null);

  // Per-instruction member-access toggle only means anything once this agent
  // can be shared at all — hidden entirely for personal agents, same gating
  // every other tool tier's "For Users" toggle already uses.
  const isShared = !!agent?.visibility && agent.visibility !== 'personal';

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('instructions')
        .select('id, title, content, enabled, available_to_members, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: true });
      setInstructions((data as Instruction[]) ?? []);
      setLoading(false);
    })();
  }, [agentId]);

  const handleSaved = (i: Instruction) => {
    setInstructions(prev => {
      const exists = prev.some(p => p.id === i.id);
      return exists ? prev.map(p => p.id === i.id ? i : p) : [...prev, i];
    });
    setModalOpen(false);
    setEditing(null);
  };

  const handleToggle = async (i: Instruction) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('instructions')
      .update({ enabled: !i.enabled })
      .eq('id', i.id)
      .select()
      .single();
    if (data) setInstructions(prev => prev.map(p => p.id === i.id ? (data as Instruction) : p));
  };

  const handleToggleMemberAccess = async (i: Instruction) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('instructions')
      .update({ available_to_members: !i.available_to_members })
      .eq('id', i.id)
      .select()
      .single();
    if (data) setInstructions(prev => prev.map(p => p.id === i.id ? (data as Instruction) : p));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    const supabase = createClient();
    const { error } = await supabase.from('instructions').delete().eq('id', deleteTarget.id);
    setDeletingId(null);
    if (!error) {
      setInstructions(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner size={20} color="#26251E" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader
          title="Teach it how to behave."
          subtitle="Reusable policy or knowledge this agent follows. Enabled instructions are added to every run."
          note={isShared ? 'Turn on "For Users" on an instruction (once it is enabled) to also show its content to connected users on their own Instructions tab.' : undefined}
          actions={<HeaderButton plus onClick={() => { setEditing(null); setModalOpen(true); }}>New instruction</HeaderButton>}
        />

        {instructions.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No instructions yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {instructions.map(i => (
              <div key={i.id} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1.1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: 0, letterSpacing: '-0.01em' }}>{i.title}</p>
                      {!i.enabled && (
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: '#EDEBE2', color: '#9E9C8F', border: '1px solid #E2DFD3' }}>disabled</span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {i.content}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    <EnableToggles
                      enabled={i.enabled}
                      onToggleEnabled={() => handleToggle(i)}
                      showForUsers={isShared}
                      forUsersEnabled={i.available_to_members}
                      onToggleForUsers={() => handleToggleMemberAccess(i)}
                    />
                    <button onClick={() => { setEditing(i); setModalOpen(true); }} style={{ background: 'none', border: '1px solid #DAD5C5', color: '#67655A', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4 }}>
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(i)}
                      disabled={deletingId === i.id}
                      style={{ background: 'none', border: '1px solid #E3C4BB', color: '#B34A3C', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', borderRadius: 4 }}
                    >
                      {deletingId === i.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <InstructionModal
          agentId={agentId}
          existing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.title}"?`}
          message="This removes the instruction permanently — it will no longer be included in this agent's prompt, and it cannot be recovered."
          loading={deletingId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

// ─── Member view — read-only, no code/create/delete affordances, just what
// the admin has chosen to share. RLS (instructions_member_read) only ever
// returns rows that are enabled AND available_to_members, so there's no
// disabled/owner-only state to filter out client-side here. ───────────────────

function MemberInstructionsView() {
  const { agentId } = useAgentCtx();
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('instructions')
        .select('id, title, content, created_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: true });
      setInstructions((data as Instruction[]) ?? []);
      setLoading(false);
    })();
  }, [agentId]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner size={20} color="#26251E" />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader title="Policy it follows." subtitle="Instructions the owner has shared, so you know what guidance this agent follows." />

        {instructions.length === 0 ? (
          <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>Nothing shared here yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {instructions.map(i => (
              <div key={i.id} style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6, padding: '1.1rem 1.25rem' }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>{i.title}</p>
                <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{i.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InstructionsPage() {
  const { role } = useAgentCtx();
  return role === 'owner' ? <OwnerInstructionsView /> : <MemberInstructionsView />;
}
