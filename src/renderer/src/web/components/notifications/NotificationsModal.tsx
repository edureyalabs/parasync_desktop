// components/notifications/NotificationsModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AttachmentChips } from '@/components/Attachments';
import { dayKey, dayLabel, formatClock, formatFull, formatRelative } from './format';
import { kindStyle } from './kinds';
import { QuestionReply } from './QuestionReply';
import { ProjectResume } from './ProjectResume';
import type { AgentNotification, NotificationsState } from './useNotifications';

// The notification wall: a vertical bead rail, newest first. Each entry is a bead on the
// rail, with its time on the left and a card on the right. The card says which task
// the entry is about (a snapshot of the task's definition) and then what the run found.
// Entries that were unread when the wall opened are marked "new" until it is closed.
// Palette: the app's "Stone & Brass" hexes (same ones the Runsheet's beads use).

const INK = '#26251E';
const SOFT = '#67655A';
const MUTED = '#9E9C8F';
const LINE = '#E2DFD3';
const RAIL = '#DAD5C5';
const PAPER = '#FBFAF7';
const BRASS = '#A17F3A';
const BRASS_DEEP = '#7C5F27';
const BRASS_RING = '#C9A24D';
const BRASS_WASH = '#F6EBCB';
const BRASS_LINE = '#E4D2A0';

const MONO = "'IBM Plex Mono', monospace";
const BEAD = 20;
const BEAD_TOP = 7; // distance from a row's top to its bead
const BEAD_CENTER = BEAD_TOP + BEAD / 2;

// ─── Small pieces ───────────────────────────────────────────────────────────

function BellGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 11.5h9l-1.1-1.6V7a3.4 3.4 0 0 0-6.8 0v2.9L3.5 11.5Z" />
      <path d="M6.6 13.4a1.5 1.5 0 0 0 2.8 0" />
    </svg>
  );
}

function ClockGlyph({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.6V8l2.3 1.4" />
    </svg>
  );
}

function Bead({ fresh }: { fresh: boolean }) {
  return (
    <span
      style={{
        position: 'relative', zIndex: 1, width: BEAD, height: BEAD, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
        background: fresh ? BRASS_WASH : '#fff',
        border: `1.5px solid ${fresh ? BRASS_RING : '#CBC5B1'}`,
        color: fresh ? BRASS : MUTED,
        boxShadow: fresh ? '0 0 0 3px rgba(201,162,77,0.16)' : 'none',
        transition: 'background 0.3s, border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <BellGlyph size={11} />
    </span>
  );
}

/** One row of the rail: time on the left, the rail with its line and bead in the middle, content on the right. */
function RailRow({ time, lineTop = 0, lineBottom = 0, bead, children }: {
  time?: ReactNode;
  /** Where the rail's line starts / stops, in px from the row's top / bottom (null = no line). */
  lineTop?: number | null;
  lineBottom?: number | null;
  bead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="nf-row" style={{ display: 'grid', gap: '0 0.65rem', alignItems: 'stretch' }}>
      <div style={{ textAlign: 'right', paddingTop: BEAD_TOP + 1 }}>{time}</div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: BEAD_TOP }}>
        {lineTop !== null && lineBottom !== null && (
          <span style={{ position: 'absolute', left: '50%', marginLeft: -1, width: 2, top: lineTop, bottom: lineBottom, background: RAIL, borderRadius: 1 }} />
        )}
        {bead}
      </div>
      <div style={{ minWidth: 0, paddingBottom: '0.85rem' }}>{children}</div>
    </div>
  );
}

function Skeleton({ width }: { width: string }) {
  return <span className="nf-shimmer" style={{ display: 'block', height: 10, borderRadius: 4, width }} />;
}

const markdownComponents = {
  table: ({ children }: { children?: ReactNode }) => (
    <div className="nf-table-wrap"><table>{children}</table></div>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
};

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'item'; key: string; item: AgentNotification; isFirst: boolean };

// ─── The modal ──────────────────────────────────────────────────────────────

export function NotificationsModal({ agentId, agentName, state, onClose }: {
  agentId: string;
  agentName: string;
  state: NotificationsState;
  onClose: () => void;
}) {
  const { items, unread, loading, loadingMore, hasMore, error, freshIds, loadMore, reload, acknowledge } = state;
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // Lock page scroll, close on Escape, and move focus into the dialog (the panel itself, so no
  // control starts with a focus ring).
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep "12m ago" honest while the wall stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Opening the wall is what reads the entries: the badge clears, and anything that was
  // unread (now or arriving while it is open) is remembered as "new" until it is closed.
  useEffect(() => { void acknowledge({ items, unread }); }, [acknowledge, items, unread]);

  // Infinite scroll: load the next page when the end of the list comes within reach. The
  // observer is recreated after every page, so a page that does not fill the view keeps loading.
  useEffect(() => {
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target || !hasMore || loadingMore || error) return;
    const observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) void loadMore(); },
      { root, rootMargin: '240px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, error, loadMore, items.length]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let currentDay = '';
    items.forEach((item, index) => {
      const key = dayKey(item.created_at);
      if (key !== currentDay) {
        currentDay = key;
        out.push({ kind: 'day', key: `day-${key}`, label: dayLabel(item.created_at, now) });
      }
      out.push({ kind: 'item', key: item.id, item, isFirst: index === 0 });
    });
    return out;
  }, [items, now]);

  const showEmpty = !loading && !error && items.length === 0;
  const showInitialError = !loading && error !== null && items.length === 0;

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <style>{`
        .nf-row { grid-template-columns: 64px ${BEAD + 8}px minmax(0, 1fr); }
        @media (max-width: 520px) { .nf-row { grid-template-columns: 52px ${BEAD + 4}px minmax(0, 1fr); } }
        .nf-card { background: #fff; border: 1px solid ${LINE}; border-radius: 8px; padding: 0.7rem 0.85rem 0.8rem; transition: box-shadow 0.15s, border-color 0.15s; }
        .nf-card:hover { border-color: #CFC9B6; box-shadow: 0 2px 10px rgba(38,37,30,0.06); }
        .nf-card.nf-fresh { background: #FFFDF5; border-color: ${BRASS_LINE}; }
        .nf-task { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 0; font-size: 0.74rem; line-height: 1.45; font-weight: 500; color: ${SOFT}; }
        .nf-md { font-size: 0.855rem; line-height: 1.65; color: #1A190F; overflow-wrap: break-word; max-width: 100%; }
        .nf-md p { margin: 0 0 0.55rem; } .nf-md p:last-child { margin-bottom: 0; }
        .nf-md ul, .nf-md ol { margin: 0 0 0.55rem 1.15rem; padding: 0; } .nf-md ul { list-style: disc; } .nf-md ol { list-style: decimal; } .nf-md li { margin-bottom: 0.15rem; }
        .nf-md h1, .nf-md h2, .nf-md h3 { font-size: 0.9rem; font-weight: 500; letter-spacing: -0.01em; margin: 0.8rem 0 0.3rem; }
        .nf-md code { font-family: ${MONO}; font-size: 0.78rem; background: #EDEBE2; padding: 0.08rem 0.3rem; border-radius: 3px; }
        .nf-md pre { background: #1a1a1a; border-radius: 6px; padding: 0.7rem 0.85rem; overflow-x: auto; margin: 0.5rem 0; } .nf-md pre code { background: none; padding: 0; color: #E2DFD3; }
        .nf-md blockquote { border-left: 2px solid ${RAIL}; margin: 0 0 0.55rem; padding-left: 0.75rem; color: ${SOFT}; }
        .nf-md a { color: ${BRASS_DEEP}; text-decoration: underline; text-underline-offset: 2px; }
        .nf-md hr { border: none; border-top: 1px solid ${LINE}; margin: 0.7rem 0; }
        .nf-table-wrap { overflow-x: auto; max-width: 100%; margin-bottom: 0.55rem; }
        .nf-md table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
        .nf-md th { background: #F3F1E8; padding: 0.35rem 0.6rem; text-align: left; font-weight: 500; border-bottom: 1px solid ${LINE}; white-space: nowrap; }
        .nf-md td { padding: 0.3rem 0.6rem; border-bottom: 1px solid #EDEBE2; white-space: nowrap; }
        .nf-shimmer { background: linear-gradient(90deg, #EDEBE2 25%, #F7F6F2 50%, #EDEBE2 75%); background-size: 200% 100%; animation: nf-shimmer 1.3s ease-in-out infinite; }
        @keyframes nf-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes nf-spin { to { transform: rotate(360deg); } }
        @keyframes nf-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .nf-panel { animation: nf-in 0.18s ease-out; }
        .nf-link-btn { background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
        .nf-close:hover { background: #F3F1E8; color: ${INK}; }
        .nf-close:focus-visible, .nf-link-btn:focus-visible { outline: 2px solid ${BRASS_RING}; outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { .nf-panel, .nf-shimmer { animation: none; } }
      `}</style>

      <div
        ref={panelRef} tabIndex={-1} className="nf-panel"
        role="dialog" aria-modal="true" aria-labelledby="nf-title"
        style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 10, width: '100%', maxWidth: 980, maxHeight: 'min(760px, 88vh)', outline: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 40px rgba(38,37,30,0.16)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '1rem 1.1rem 0.95rem', borderBottom: `1px solid ${LINE}`, background: 'linear-gradient(180deg, #FBF6E6 0%, #FFFFFF 100%)', flexShrink: 0 }}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRASS_WASH, border: `1px solid ${BRASS_LINE}`, color: BRASS, flexShrink: 0 }}>
            <BellGlyph size={18} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="nf-title" style={{ fontSize: '1.02rem', fontWeight: 500, letterSpacing: '-0.02em', color: INK, margin: 0 }}>Notifications</h2>
            <p style={{ fontSize: '0.74rem', color: MUTED, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Updates and questions from {agentName}&apos;s background work
            </p>
          </div>
          {freshIds.size > 0 && (
            <span style={{ fontFamily: MONO, fontSize: '0.64rem', padding: '0.18rem 0.5rem', borderRadius: 999, background: BRASS_WASH, color: BRASS_DEEP, border: `1px solid ${BRASS_LINE}`, whiteSpace: 'nowrap' }}>
              {freshIds.size} new
            </span>
          )}
          <button
            onClick={onClose} className="nf-close" aria-label="Close notifications"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: SOFT, width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem 1.1rem 0.5rem' }}>
          {loading && (
            <div aria-busy="true" aria-label="Loading notifications">
              {[0, 1, 2].map(i => (
                <RailRow key={i} lineTop={i === 0 ? BEAD_CENTER : 0} lineBottom={0}
                  time={<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}><Skeleton width="38px" /><Skeleton width="28px" /></div>}
                  bead={<Bead fresh={false} />}
                >
                  <div className="nf-card" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <Skeleton width="55%" /><Skeleton width="92%" /><Skeleton width="70%" />
                  </div>
                </RailRow>
              ))}
            </div>
          )}

          {showEmpty && (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem 3.2rem' }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', border: `1.5px dashed ${BRASS_RING}`, background: '#FFFDF5', color: BRASS, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <BellGlyph size={24} />
              </span>
              <p style={{ fontSize: '0.95rem', fontWeight: 500, color: INK, margin: '1rem 0 0.35rem' }}>Nothing here yet</p>
              <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: SOFT, margin: '0 auto', maxWidth: 330 }}>
                When this agent&apos;s recurring tasks run, their results are posted here instead of filling the chat. A project that needs an answer from you asks here too.
              </p>
            </div>
          )}

          {showInitialError && (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 500, color: INK, margin: '0 0 0.35rem' }}>Couldn&apos;t load notifications</p>
              <p style={{ fontSize: '0.8rem', color: SOFT, margin: '0 0 1rem' }}>Check your connection and try again.</p>
              <button onClick={() => void reload()} style={{ background: INK, color: '#fff', border: 'none', borderRadius: 4, padding: '0.5rem 1.1rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {!loading && items.length > 0 && (
            <div role="feed" aria-label="Notifications, newest first">
              {rows.map(row => {
                if (row.kind === 'day') {
                  return (
                    <RailRow key={row.key} lineTop={0} lineBottom={0}>
                      <div role="separator" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.1rem 0 0.7rem' }}>
                        <span style={{ fontFamily: MONO, fontSize: '0.64rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: SOFT, whiteSpace: 'nowrap' }}>{row.label}</span>
                        <span style={{ flex: 1, height: 1, background: LINE }} />
                      </div>
                    </RailRow>
                  );
                }
                const { item } = row;
                const fresh = freshIds.has(item.id);
                const kind = kindStyle(item.kind);
                return (
                  <RailRow
                    key={row.key}
                    lineTop={row.isFirst ? BEAD_CENTER : 0} lineBottom={0}
                    bead={<Bead fresh={fresh} />}
                    time={
                      <time dateTime={item.created_at} title={formatFull(item.created_at)} style={{ display: 'block', cursor: 'default' }}>
                        <span style={{ display: 'block', fontFamily: MONO, fontSize: '0.68rem', color: INK, whiteSpace: 'nowrap' }}>{formatClock(item.created_at)}</span>
                        <span style={{ display: 'block', fontSize: '0.64rem', color: MUTED, marginTop: 2, whiteSpace: 'nowrap' }}>{formatRelative(item.created_at, now)}</span>
                      </time>
                    }
                  >
                    <article className={`nf-card${fresh ? ' nf-fresh' : ''}`} aria-label={`${kind.label}, ${formatFull(item.created_at)}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.32rem', fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: kind.fg, background: kind.bg, border: `1px solid ${kind.border}`, borderRadius: 3, padding: '0.12rem 0.42rem' }}>
                          <ClockGlyph size={10} />
                          {kind.label}
                        </span>
                        {fresh && (
                          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '0.58rem', letterSpacing: '0.06em', color: '#fff', background: BRASS, borderRadius: 3, padding: '0.1rem 0.38rem', flexShrink: 0 }}>NEW</span>
                        )}
                      </div>
                      <p className="nf-task" title={item.task_label} style={{ marginBottom: '0.55rem' }}>{item.task_label}</p>
                      <div className="nf-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{item.body}</ReactMarkdown>
                      </div>
                      {item.attachments && item.attachments.length > 0 && (
                        <AttachmentChips agentId={agentId} attachments={item.attachments} />
                      )}
                      {item.kind === 'project_question' && <QuestionReply item={item} onAnswered={reload} />}
                      {item.kind === 'project_stopped' && <ProjectResume item={item} onResumed={reload} />}
                    </article>
                  </RailRow>
                );
              })}

              {/* The end of the loaded list: more on the way, a retry, or the start of the timeline. */}
              <RailRow lineTop={hasMore ? 0 : null} lineBottom={hasMore ? 0 : null}>
                <div ref={sentinelRef} style={{ minHeight: 8 }} />
              </RailRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.2rem 0 1rem', fontSize: '0.74rem', color: MUTED }}>
                {error ? (
                  <>
                    <span style={{ color: '#B34A3C' }}>{error}</span>
                    <button className="nf-link-btn" onClick={() => void loadMore()} style={{ color: BRASS_DEEP, textDecoration: 'underline', fontSize: '0.74rem' }}>Retry</button>
                  </>
                ) : loadingMore ? (
                  <>
                    <span style={{ width: 13, height: 13, border: `1.5px solid ${RAIL}`, borderTopColor: BRASS, borderRadius: '50%', animation: 'nf-spin 0.8s linear infinite' }} />
                    Loading older notifications…
                  </>
                ) : hasMore ? (
                  <button className="nf-link-btn" onClick={() => void loadMore()} style={{ color: SOFT, fontSize: '0.74rem' }}>Load older</button>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>You&apos;re all caught up</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
