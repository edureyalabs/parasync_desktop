// app/(shell)/account/organizations/OrgModals.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { allTimezones } from '@/lib/timezones';
import { Spinner } from '@/components/account/ui';
import type { Organization, OrgDraft } from './types';

// Create / edit an organization. Moved out of page.tsx unchanged in behaviour (the page now
// only loads data and lays out the cards); the styles the two forms rely on are defined here so
// they no longer depend on the page that happens to render them.

const MODAL_STYLES = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .org-input {
    width: 100%; padding: 0.6rem 0.75rem; font-size: 0.875rem;
    font-family: 'Inter', sans-serif; color: #26251E; background: #F7F6F2;
    border: 1px solid #DAD5C5; border-radius: 4px; outline: none;
    transition: border-color 0.15s; box-sizing: border-box;
  }
  .org-input:focus { border-color: #26251E; }
  .org-input::placeholder { color: #9E9C8F; }
`;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

// ─── Create Org Modal ─────────────────────────────────────────────────────────

export function CreateOrgModal({ userId, onClose, onCreated }: {
  userId: string;
  onClose: () => void;
  onCreated: (org: Organization) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Organization name is required.'); return; }
    if (trimmedName.length < 2) { setError('Name must be at least 2 characters.'); return; }

    const slug = slugify(trimmedName);
    if (!slug) { setError('Name must contain at least one letter or number.'); return; }

    setLoading(true);
    setError('');

    const supabase = createClient();

    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existing) {
      setError('An organization with a similar name already exists.');
      setLoading(false);
      return;
    }

    const { data, error: dbError } = await supabase
      .from('organizations')
      .insert({ name: trimmedName, description: description.trim() || null, owner_id: userId, slug })
      .select()
      .single();

    setLoading(false);

    if (dbError) {
      setError(dbError.code === '23505' ? 'An organization with this name already exists.' : 'Something went wrong. Please try again.');
      return;
    }

    onCreated(data as Organization);
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.35)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.15s ease both',
      }}
    >
      <style>{MODAL_STYLES}</style>
      <div style={{
        background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8,
        padding: '2rem', width: '100%', maxWidth: 440,
        animation: 'slideUp 0.2s ease both',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              New organization
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              Create a workspace
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Name <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              ref={nameRef}
              className="org-input"
              type="text"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              maxLength={60}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Description{' '}
              <span style={{ color: '#67655A', fontFamily: "'Inter', sans-serif", textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>optional</span>
            </label>
            <textarea
              className="org-input"
              placeholder="What does this organization do?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
              style={{ resize: 'none', lineHeight: 1.6 }}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
              {description.length}/200
            </p>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            style={{
              background: '#26251E', color: '#F7F6F2', border: 'none',
              padding: '0.55rem 1.25rem', fontSize: '0.825rem',
              fontFamily: "'Inter', sans-serif",
              cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem',
              opacity: !name.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? 'Creating…' : 'Create organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Org Modal ───────────────────────────────────────────────────────────

export function EditOrgModal({ org, onClose, onSaved }: {
  org: Organization;
  onClose: () => void;
  onSaved: (draft: OrgDraft) => void;
}) {
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? '');
  const [timezone, setTimezone] = useState(org.timezone ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Organization name is required.'); return; }
    if (trimmedName.length < 2) { setError('Name must be at least 2 characters.'); return; }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from('organizations')
      .update({ name: trimmedName, description: description.trim() || null, timezone: timezone || null })
      .eq('id', org.id);

    setLoading(false);

    if (dbError) {
      setError('Something went wrong. Please try again.');
      return;
    }

    onSaved({ name: trimmedName, description: description.trim(), timezone: timezone || null });
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.35)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.15s ease both',
      }}
    >
      <style>{MODAL_STYLES}</style>
      <div style={{
        background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8,
        padding: '2rem', width: '100%', maxWidth: 440,
        animation: 'slideUp 0.2s ease both',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              Edit organization
            </p>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
              {org.name}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Name <span style={{ color: '#B34A3C' }}>*</span>
            </label>
            <input
              ref={nameRef}
              className="org-input"
              type="text"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              maxLength={60}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Description{' '}
              <span style={{ color: '#67655A', fontFamily: "'Inter', sans-serif", textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>optional</span>
            </label>
            <textarea
              className="org-input"
              placeholder="What does this organization do?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={200}
              rows={3}
              style={{ resize: 'none', lineHeight: 1.6 }}
            />
            <p style={{ fontSize: '0.72rem', color: '#9E9C8F', margin: '0.3rem 0 0', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
              {description.length}/200
            </p>
          </div>
          <div>
            <label htmlFor="org-timezone" style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Timezone{' '}
              <span style={{ color: '#67655A', fontFamily: "'Inter', sans-serif", textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>used for shift times</span>
            </label>
            <select id="org-timezone" className="org-input" value={timezone} onChange={e => setTimezone(e.target.value)}>
              <option value="">Not set</option>
              {timezone && !allTimezones().includes(timezone) && <option value={timezone}>{timezone}</option>}
              {allTimezones().map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            style={{
              background: '#26251E', color: '#F7F6F2', border: 'none',
              padding: '0.55rem 1.25rem', fontSize: '0.825rem',
              fontFamily: "'Inter', sans-serif",
              cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
              borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem',
              opacity: !name.trim() ? 0.5 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading && <Spinner size={14} color="#fff" />}
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
