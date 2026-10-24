// app/(shell)/agents/[id]/email/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAgentCtx } from '../layout';
import { createClient } from '@/lib/supabase/client';
import { AgentPage } from '@/components/agent-ui/AgentPage';
import { copyText } from '@/components/agent-ui/clipboard';
import { EmailHtmlFrame } from '@/components/email/EmailHtmlFrame';
import { EmailSettingsModal, type EmailSettings } from '@/components/email/EmailSettingsModal';
import { Btn, Card, Chip, EmptyState, PageLoading, Spinner } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtDate, fmtDateShort, fmtTime, initials } from '@/components/account/format';
import { agentEmailAddress, sourceLabel, STATUS_LABELS } from '@/lib/agentEmail';

// The Emails tab, laid out like a mail client: the message list on the left and a reading pane. It only shows what the agent SENT through the send_email
// platform tool (sending only; receiving comes later). Everything about how the agent may send (sender address, who it may email, daily limit, reply-to)
// lives in the Settings dialog so the mail gets the screen. An email's formatted (HTML) version is loaded when it is opened and shown in a locked-down frame.
// Shown only while send_email is enabled for the agent (the tab strip checks that). Reads go straight to Supabase under RLS (owner/admin only); the emails
// themselves are written by bemain and their delivery status by the Resend webhook (supabase/functions/resend-webhook).

const PAGE = 25;

interface EmailRow {
  id: string;
  created_at: string;
  to_addresses: string[];
  subject: string;
  body_text: string;
  status: string;
  error: string | null;
  source_kind: string | null;
  from_address: string;
  reply_to: string | null;
  attachments: { filename: string; size: number }[] | null;
}

const DEFAULTS: EmailSettings = { allow_any_recipient: false, allowed_recipients: [], daily_cap: 50, reply_to_mode: 'user', suspended: false, suspended_reason: null };

type Tone = 'green' | 'amber' | 'red' | 'brass' | 'slate' | 'neutral';
const STATUS_TONE: Record<string, Tone> = { sending: 'neutral', sent: 'slate', delayed: 'amber', delivered: 'green', bounced: 'red', complained: 'red', failed: 'red' };
const STATUS_DOT: Record<string, string> = { sending: C.muted, sent: C.slate, delayed: C.amber, delivered: C.green, bounced: C.red, complained: C.red, failed: C.red };
const ISSUE_STATUSES = new Set(['delayed', 'bounced', 'complained', 'failed']);

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mail-client list stamp: the time for today, "Oct 24" this year, the full date before that.
function listStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  return d.getFullYear() === now.getFullYear() ? fmtDateShort(iso) : fmtDate(iso);
}

function recipientLine(r: EmailRow): string {
  const first = r.to_addresses[0] ?? '(no recipient)';
  const extra = r.to_addresses.length - 1;
  return extra > 0 ? `${first} +${extra}` : first;
}

function snippet(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, 140);
}

interface EmailState {
  enabled: boolean;
  settings: EmailSettings;
  rows: EmailRow[];
  loadError: string;
}

const ROW_COLUMNS = 'id, created_at, to_addresses, subject, body_text, status, error, source_kind, from_address, reply_to, attachments';

// Everything the tab shows, read in one go. Pure: it returns the state, the component applies it (so no state is set while an effect is still running).
async function fetchEmailState(agentId: string): Promise<EmailState> {
  const supabase = createClient();
  const [toolRes, settingsRes, listRes] = await Promise.all([
    supabase.from('agent_platform_tools').select('enabled').eq('agent_id', agentId).eq('tool_key', 'send_email').maybeSingle(),
    supabase.from('agent_email_settings').select('allow_any_recipient, allowed_recipients, daily_cap, reply_to_mode, suspended, suspended_reason').eq('agent_id', agentId).maybeSingle(),
    supabase.from('agent_emails').select(ROW_COLUMNS).eq('agent_id', agentId).order('created_at', { ascending: false }).range(0, PAGE - 1),
  ]);
  const settings: EmailSettings = settingsRes.data
    ? { ...DEFAULTS, ...(settingsRes.data as Partial<EmailSettings>), allowed_recipients: settingsRes.data.allowed_recipients ?? [] }
    : DEFAULTS;
  return {
    enabled: !!toolRes.data?.enabled,
    settings,
    rows: (listRes.data ?? []) as EmailRow[],
    loadError: listRes.error || settingsRes.error ? 'Could not load the email history. Try again in a moment.' : '',
  };
}

const MAIL_CSS = `
  .em-body { flex: 1; min-height: 0; display: flex; }
  .em-list { width: 420px; max-width: 45%; flex-shrink: 0; border-right: 1px solid ${C.line}; display: flex; flex-direction: column; min-height: 0; }
  .em-read { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; background: ${C.card}; }
  .em-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 0.7rem; width: 100%; text-align: left; border: none; border-bottom: 1px solid ${C.lineSoft}; border-left: 3px solid transparent; background: transparent; padding: 0.7rem 0.9rem 0.7rem 0.75rem; cursor: pointer; font: inherit; }
  .em-row:hover { background: ${C.paper}; }
  .em-row[aria-current="true"] { background: ${C.brassTint}; border-left-color: ${C.brass}; }
  .em-row:focus-visible { outline: 2px solid ${C.brass}; outline-offset: -2px; }
  .em-back { display: none; }
  @media (max-width: 760px) {
    .em-list { width: 100%; max-width: none; border-right: none; }
    .em-root[data-view="read"] .em-list { display: none; }
    .em-root[data-view="list"] .em-read { display: none; }
    .em-back { display: block; }
    .em-toolbar-address { display: none; }
  }
`;

export default function EmailPage() {
  const { agent, agentId, role } = useAgentCtx();
  const handle = agent?.handle ?? '';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState<EmailSettings>(DEFAULTS);
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The formatted body is fetched when an email is opened (up to 100,000 characters each, so never with the list). undefined = not asked yet, null = none.
  const [htmlById, setHtmlById] = useState<Record<string, string | null | undefined>>({});
  const [view, setView] = useState<'html' | 'text'>('html');
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  const apply = useCallback((data: EmailState) => {
    setLoadError(data.loadError);
    setEnabled(data.enabled);
    setSaved(data.settings);
    setRows(data.rows);
    setHasMore(data.rows.length === PAGE);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!agentId) return;
    (async () => {
      apply(await fetchEmailState(agentId));
    })();
  }, [agentId, apply]);

  const refresh = async () => {
    setRefreshing(true);
    apply(await fetchEmailState(agentId));
    setRefreshing(false);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await createClient().from('agent_emails')
      .select(ROW_COLUMNS)
      .eq('agent_id', agentId).order('created_at', { ascending: false }).range(rows.length, rows.length + PAGE - 1);
    const more = (data ?? []) as EmailRow[];
    setRows(prev => [...prev, ...more]);
    setHasMore(more.length === PAGE);
    setLoadingMore(false);
  };

  const address = handle ? agentEmailAddress(handle) : '';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (!q) return true;
      return r.subject.toLowerCase().includes(q) || r.body_text.toLowerCase().includes(q) || r.to_addresses.some(a => a.toLowerCase().includes(q));
    });
  }, [rows, query]);

  const selected = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId]);

  const openEmail = async (id: string) => {
    setSelectedId(id);
    setView('html');
    if (htmlById[id] !== undefined) return;
    const { data, error } = await createClient().from('agent_emails').select('body_html').eq('id', id).eq('agent_id', agentId).maybeSingle();
    if (error) return;            // leave it unasked so opening the email again retries
    setHtmlById(prev => ({ ...prev, [id]: (data?.body_html as string | null | undefined) ?? null }));
  };

  const copyAddress = async () => {
    if (await copyText(address)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  if (loading) return <PageLoading />;

  if (role !== 'owner') {
    return (
      <AgentPage eyebrow="Emails" title="Emails">
        <Card><EmptyState icon="✉" title="Only the owner can see this">The email history and sending rules are managed by the agent&rsquo;s owner.</EmptyState></Card>
      </AgentPage>
    );
  }

  if (!enabled) {
    return (
      <AgentPage eyebrow="Emails" title="Emails">
        <Card>
          <EmptyState icon="✉" title="Email is off for this agent" action={<Link href={`/agents/${agentId}/platform-tools`} style={{ textDecoration: 'none' }}><Btn variant="primary">Open Platform Tools</Btn></Link>}>
            Turn on <span style={{ fontFamily: MONO }}>send_email</span> in Platform Tools to let this agent send email from its own address. Its history and rules appear here.
          </EmptyState>
        </Card>
      </AgentPage>
    );
  }

  const agentName = agent?.name ?? 'this agent';

  return (
    <div
      className="em-root" data-view={selected ? 'read' : 'list'}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: C.card, fontFamily: "'Inter', 'Helvetica Neue', sans-serif", color: C.ink }}
    >
      <style>{MAIL_CSS}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.6rem 1rem', borderBottom: `1px solid ${C.line}`, background: C.card, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '1.2rem', fontWeight: 500, color: '#514726', margin: 0, whiteSpace: 'nowrap' }}>Emails <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.78rem', fontWeight: 400, color: C.soft }}>&ndash; Sending only</span></h1>
          {address && (
            <button
              type="button" onClick={copyAddress} title="Copy the agent's email address" className="em-toolbar-address"
              style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: '0.72rem', color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}
            >{copied ? 'Copied' : address}</button>
          )}
        </div>
        <div style={{ flex: '1 1 220px', maxWidth: 460, marginLeft: 'auto' }}>
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recipient, subject or text" aria-label="Search sent email"
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.45rem 0.8rem', fontSize: '0.8rem', fontFamily: "'Inter', sans-serif", border: `1px solid ${C.line}`, borderRadius: 999, background: C.surface, color: C.ink, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Btn size="sm" onClick={refresh} disabled={refreshing} aria-label="Refresh">{refreshing ? <Spinner size={12} /> : '↻'} Refresh</Btn>
          <Btn size="sm" variant="primary" onClick={() => setShowSettings(true)}>⚙ Settings</Btn>
        </div>
      </div>

      {saved.suspended && (
        <div style={{ padding: '0.5rem 1rem', background: C.redWash, borderBottom: `1px solid ${C.redLine}`, fontSize: '0.78rem', color: C.red }}>
          Sending is switched off for this agent.{saved.suspended_reason ? ` ${saved.suspended_reason}` : ''}
        </div>
      )}
      {loadError && <div style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', color: C.red, borderBottom: `1px solid ${C.lineSoft}` }}>{loadError}</div>}

      <div className="em-body">
        <div className="em-split" style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
          <section className="em-list" aria-label="Sent email">
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {visible.length === 0 ? (
                <EmptyState icon="✉" title={rows.length === 0 ? 'Nothing sent yet' : 'No matching email'}>
                  {rows.length === 0
                    ? 'When this agent sends an email, it appears here with its delivery status.'
                    : 'Try a different search, or load older email.'}
                </EmptyState>
              ) : visible.map(r => {
                const problem = ISSUE_STATUSES.has(r.status);
                return (
                  <button key={r.id} type="button" className="em-row" aria-current={selectedId === r.id} onClick={() => { void openEmail(r.id); }}>
                    <span aria-hidden style={{ width: 34, height: 34, borderRadius: '50%', background: C.brassWash, color: C.brassDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 500 }}>
                      {initials((r.to_addresses[0] ?? '?').split('@')[0].replace(/[._-]+/g, ' ')) || '?'}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipientLine(r)}</span>
                      <span style={{ display: 'block', fontSize: '0.8rem', color: C.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</span>
                      <span style={{ display: 'block', fontSize: '0.76rem', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(r.attachments?.length ?? 0) > 0 ? '📎 ' : ''}{snippet(r.body_text)}
                      </span>
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                      <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: C.muted, whiteSpace: 'nowrap' }}>{listStamp(r.created_at)}</span>
                      {problem
                        ? <Chip tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_LABELS[r.status] ?? r.status}</Chip>
                        : <span title={STATUS_LABELS[r.status] ?? r.status} aria-label={STATUS_LABELS[r.status] ?? r.status} style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[r.status] ?? C.muted, marginTop: 3 }} />}
                    </span>
                  </button>
                );
              })}
              {hasMore && (
                <div style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                  <Btn size="sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load older email'}</Btn>
                </div>
              )}
            </div>
          </section>

          <article className="em-read" aria-label="Message">
            {!selected ? (
              <div style={{ height: '100%', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', color: C.muted }}>
                <div>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.55 }}>✉</span>
                  <p style={{ fontSize: '0.86rem', margin: 0 }}>Select an email to read it</p>
                </div>
              </div>
            ) : (
              <div style={{ padding: '1.2rem 1.6rem 2rem', maxWidth: 820 }}>
                <div className="em-back" style={{ marginBottom: '0.8rem' }}>
                  <Btn size="sm" variant="ghost" onClick={() => setSelectedId(null)}>← Back</Btn>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.015em', margin: 0, lineHeight: 1.35, minWidth: 0, wordBreak: 'break-word' }}>{selected.subject}</h2>
                  <Chip tone={STATUS_TONE[selected.status] ?? 'neutral'} dot>{STATUS_LABELS[selected.status] ?? selected.status}</Chip>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', margin: '1.1rem 0 0' }}>
                  <span aria-hidden style={{ width: 38, height: 38, borderRadius: '50%', background: C.ink, color: '#F7F6F2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 500, flexShrink: 0 }}>
                    {initials(agentName) || 'A'}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.86rem' }}>
                      <strong style={{ fontWeight: 500 }}>{agentName}</strong>{' '}
                      <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: C.soft, wordBreak: 'break-all' }}>&lt;{selected.from_address}&gt;</span>
                    </p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: C.soft, wordBreak: 'break-word' }}>to {selected.to_addresses.join(', ')}</p>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: '0.68rem', color: C.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtDate(selected.created_at)}<br />{fmtTime(selected.created_at)}</span>
                </div>

                <dl style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: '0.3rem 0.8rem', margin: '1rem 0 0', padding: '0.7rem 0.9rem', background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 8, fontSize: '0.76rem', color: C.body }}>
                  {selected.reply_to && <><dt style={{ color: C.muted }}>Reply-To</dt><dd style={{ margin: 0, fontFamily: MONO, fontSize: '0.72rem', wordBreak: 'break-all' }}>{selected.reply_to}</dd></>}
                  <dt style={{ color: C.muted }}>Triggered by</dt><dd style={{ margin: 0 }}>{sourceLabel(selected.source_kind)}</dd>
                  <dt style={{ color: C.muted }}>Delivery</dt><dd style={{ margin: 0 }}>{STATUS_LABELS[selected.status] ?? selected.status}</dd>
                </dl>

                {selected.error && (
                  <p style={{ fontSize: '0.78rem', color: C.red, background: C.redWash, border: `1px solid ${C.redLine}`, borderRadius: 6, padding: '0.55rem 0.75rem', margin: '0.9rem 0 0' }}>{selected.error}</p>
                )}

                {(() => {
                  const html = htmlById[selected.id];
                  const showHtml = view === 'html' && !!html;
                  return (
                    <div style={{ margin: '1.3rem 0 0' }}>
                      {(html || html === undefined) && (
                        <div role="group" aria-label="Message format" style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', marginBottom: '0.8rem' }}>
                          {(['html', 'text'] as const).map(v => (
                            <button
                              key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} disabled={html === undefined}
                              style={{ border: 'none', padding: '0.28rem 0.8rem', fontSize: '0.72rem', fontFamily: "'Inter', sans-serif", cursor: html === undefined ? 'wait' : 'pointer', background: view === v ? C.ink : 'transparent', color: view === v ? '#F7F6F2' : C.body }}
                            >{v === 'html' ? 'Formatted' : 'Plain text'}</button>
                          ))}
                        </div>
                      )}
                      {showHtml ? (
                        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, overflow: 'hidden' }}>
                          <EmailHtmlFrame key={selected.id} html={html!} title={`Email: ${selected.subject}`} />
                        </div>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.88rem', lineHeight: 1.7, color: C.ink }}>{selected.body_text}</div>
                      )}
                    </div>
                  );
                })()}

                {(selected.attachments?.length ?? 0) > 0 && (
                  <div style={{ margin: '1.5rem 0 0', paddingTop: '1rem', borderTop: `1px solid ${C.lineSoft}` }}>
                    <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>{selected.attachments!.length} attachment{selected.attachments!.length === 1 ? '' : 's'}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {selected.attachments!.map((a, i) => (
                        <span key={`${a.filename}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.76rem', color: C.body, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: '0.4rem 0.7rem' }}>
                          📎 {a.filename} <span style={{ color: C.muted }}>{fmtSize(a.size)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        </div>
      </div>

      {showSettings && (
        <EmailSettingsModal
          agentId={agentId} agentName={agentName} address={address} saved={saved}
          onSaved={next => setSaved(prev => ({ ...prev, ...next }))} onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
