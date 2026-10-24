// app/(shell)/account/billing/PurchaseHistory.tsx
'use client';

import { useMemo, useState } from 'react';
import { Btn, Card, EmptyState } from '@/components/account/ui';
import { C, MONO } from '@/components/account/tokens';
import { fmtAmount, fmtDate, fmtInr, fmtTime } from '@/components/account/format';
import { groupByMonth, type Purchase } from './purchases';

// Every top-up, grouped by month. The amount added is green (money in); what was
// actually paid and the invoice number sit beside it so a purchase can be matched to a bank
// statement. Shown PAGE at a time so a long history never makes the page heavy.

const PAGE = 12;

function money(p: Purchase['paid']): string {
  if (!p) return '—';
  return p.currency === 'INR' ? `₹${fmtInr(p.amount, 2)}` : `${p.currency} ${p.amount.toFixed(2)}`;
}

const GRID = 'minmax(150px, 1.3fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(180px, 1.6fr)';

export function PurchaseHistory({ purchases, onAddFunds }: { purchases: Purchase[]; onAddFunds: () => void }) {
  const [shown, setShown] = useState(PAGE);
  const visible = useMemo(() => purchases.slice(0, shown), [purchases, shown]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);

  if (purchases.length === 0) {
    return (
      <Card pad="0">
        <EmptyState
          icon={<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5.5" width="16" height="11" rx="2" /><path d="M3 9.5h16M7 13.5h3" /></svg>}
          title="No top-ups yet"
          action={<Btn variant="brass" onClick={onAddFunds}>+ Add funds</Btn>}
        >
          When you add funds they will be listed here with the amount you paid and your invoice number.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card pad="0" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', padding: '1.1rem 1.4rem 0.9rem' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 500, color: C.soft, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0 }}>Purchase history</h2>
        <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: C.muted }}>{purchases.length} purchase{purchases.length === 1 ? '' : 's'}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640 }}>
          <div role="row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 1rem', padding: '0.55rem 1.4rem', background: C.surface, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
            {['Date', 'Added', 'Amount paid', 'Invoice'].map((h, i) => (
              <span key={h} role="columnheader" style={{ fontFamily: MONO, fontSize: '0.6rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', textAlign: i === 1 || i === 2 ? 'right' : 'left' }}>{h}</span>
            ))}
          </div>

          {groups.map(group => (
            <div key={group.key} role="rowgroup">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1.4rem', background: C.paper, borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 500, color: C.body }}>{group.label}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.66rem', color: C.green }}>+${fmtAmount(group.amount)} · {group.items.length} purchase{group.items.length === 1 ? '' : 's'}</span>
              </div>
              {group.items.map(p => (
                <div key={p.id} role="row" className="ac-row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 1rem', alignItems: 'center', padding: '0.8rem 1.4rem', borderBottom: `1px solid ${C.lineSoft}` }}>
                  <div role="cell">
                    <p style={{ fontSize: '0.82rem', color: C.ink, margin: 0 }}>{fmtDate(p.at)}</p>
                    <p style={{ fontFamily: MONO, fontSize: '0.64rem', color: C.muted, margin: '2px 0 0' }}>{fmtTime(p.at)}</p>
                  </div>
                  <span role="cell" style={{ textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.86rem', fontWeight: 500, color: C.green }}>+${fmtAmount(p.amount)}</span>
                  <span role="cell" style={{ textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem', color: p.paid ? C.body : C.faint }}>{money(p.paid)}</span>
                  <span role="cell" style={{ fontFamily: MONO, fontSize: '0.72rem', color: p.invoiceNumber ? C.soft : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.invoiceNumber ?? undefined}>{p.invoiceNumber ?? '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {shown < purchases.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.9rem', borderTop: `1px solid ${C.lineSoft}` }}>
          <Btn variant="outline" size="sm" onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, purchases.length - shown)} more</Btn>
        </div>
      )}
    </Card>
  );
}
