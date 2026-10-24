// components/shifts/ShiftSop.tsx
'use client';

// The SOP tab of a shift card: the standing operating procedure the shift's agent writes for itself (see bemain shifts/sop.py),
// whether the shift is learning or working, why it went back to learning, and every saved version. Read-only for the owner.
import { useState } from 'react';
import { ACCENT, INK, LINE, MUTED, PAPER, SOFT } from '@/components/runsheet/tokens';
import type { Shift, SopContent, SopVersion } from './types';
import { useShiftSop } from './useShiftSop';
import ShiftLearning from './ShiftLearning';

const MONO = "'IBM Plex Mono', monospace";
const SECTIONS: [keyof SopContent['sections'], string][] = [
  ['overview', 'Overview'], ['constraints', 'Constraints it verified'], ['recipes', 'Recipes'], ['pitfalls', 'Pitfalls'], ['playbook', 'Playbook'], ['open_questions', 'Still to verify'],
];
const WHO: Record<SopVersion['edited_by'], string> = { learner: 'learning wake', runner: 'working wake', owner: 'you' };

const panel: React.CSSProperties = { marginTop: '0.6rem', background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${ACCENT.plan}`, borderRadius: 6, padding: '0.7rem 0.85rem 0.8rem' };
const label: React.CSSProperties = { margin: 0, fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED };
const body: React.CSSProperties = { margin: '0.25rem 0 0', fontSize: '0.8rem', color: INK, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

function stamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function modeLine(shift: Shift): { text: string; color: string } {
  if (shift.sop_status === 'ready') return { text: 'Working mode: the agent works from this SOP and mainly adds steps.', color: '#3D7A4F' };
  if (shift.arena_state === 'running') return { text: 'Learning: the agent is preparing before the shift starts.', color: '#A17F3A' };
  if (shift.arena_state === 'gave_up') return { text: 'Learning: the preparation did not finish, so the first wake will continue it.', color: '#B34A3C' };
  if (shift.learn_note) return { text: 'Learning: it went back to learning mode after meeting something its SOP did not cover.', color: '#A17F3A' };
  return { text: 'Learning: the SOP is not ready yet.', color: '#A17F3A' };
}

export default function ShiftSop({ shift }: { shift: Shift }) {
  const { versions, loading } = useShiftSop(shift.id, true);
  const [showHistory, setShowHistory] = useState(false);
  const current = versions[0];
  const content = current?.content;
  const note = shift.learn_note;
  const mode = modeLine(shift);
  const toolNotes = Object.entries(content?.tool_notes ?? {});
  const empty = !content || (SECTIONS.every(([k]) => !(content.sections[k] ?? '').trim()) && toolNotes.length === 0);

  return (
    <>
    <ShiftLearning shift={shift} />
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: ACCENT.plan }}>SOP</span>
        {current && <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: SOFT }}>version {current.version} · {stamp(current.created_at)}</span>}
      </div>
      <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: mode.color }}>{mode.text}</p>
      <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: MUTED, lineHeight: 1.5 }}>
        The agent writes this for itself from what it actually saw, so it does not learn the same thing twice. It never overrides your shift brief. Every change is saved as a version.
      </p>

      {note && shift.sop_status === 'learning' && (note.reason || note.unknown) && (
        <div style={{ marginTop: '0.6rem', borderLeft: '2px solid #A17F3A', paddingLeft: '0.6rem' }}>
          <p style={label}>{note.auto ? 'Why the platform sent it back to learning' : 'Why it went back to learning'}</p>
          {note.reason && <p style={body}>{note.reason}</p>}
          {note.unknown && <p style={{ ...body, color: SOFT }}>To find out: {note.unknown}</p>}
          {note.pending && <p style={{ ...body, color: SOFT }}>Still to happen: {note.pending}</p>}
        </div>
      )}

      {loading ? <p style={{ ...body, color: MUTED }}>Loading…</p> : empty ? (
        <p style={{ ...body, color: MUTED }}>Nothing written yet. It appears here as the agent learns the shift’s tools and systems.</p>
      ) : (
        <>
          {SECTIONS.map(([key, title]) => (content!.sections[key] ?? '').trim() ? (
            <div key={key} style={{ marginTop: '0.65rem' }}>
              <p style={label}>{title}</p>
              <p style={body}>{content!.sections[key]}</p>
            </div>
          ) : null)}
          {toolNotes.length > 0 && (
            <div style={{ marginTop: '0.65rem' }}>
              <p style={label}>What it learnt about its tools</p>
              <ul style={{ margin: '0.25rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {toolNotes.map(([tool, text]) => (
                  <li key={tool} style={{ fontSize: '0.78rem', color: INK, lineHeight: 1.55 }}>
                    <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: ACCENT.tool }}>{tool}</span>
                    <span style={{ whiteSpace: 'pre-wrap', color: SOFT }}> {text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {versions.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <button onClick={() => setShowHistory(s => !s)} aria-expanded={showHistory}
            style={{ background: 'none', border: 'none', padding: 0, color: SOFT, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            {showHistory ? 'Hide history' : `History (${versions.length} version${versions.length === 1 ? '' : 's'})`}
          </button>
          {showHistory && (
            <ul style={{ margin: '0.4rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {versions.map(v => (
                <li key={v.id} style={{ fontSize: '0.76rem', color: INK, lineHeight: 1.5, borderLeft: `2px solid ${LINE}`, paddingLeft: '0.55rem' }}>
                  <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: SOFT }}>v{v.version} · {stamp(v.created_at)} · {WHO[v.edited_by]}{v.edited_in ? ` (${v.edited_in})` : ''}</span>
                  <div>{v.change}{v.reason ? ` — ${v.reason}` : ''}</div>
                  {v.evidence && <div style={{ color: MUTED, fontSize: '0.72rem' }}>Evidence: {v.evidence}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
    </>
  );
}
