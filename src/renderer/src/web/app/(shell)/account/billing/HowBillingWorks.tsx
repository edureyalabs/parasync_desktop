// app/(shell)/account/billing/HowBillingWorks.tsx
import { C, MONO } from '@/components/account/tokens';
import { Card } from '@/components/account/ui';

// Plain-language explainer: one account-wide balance in dollars, spent per token and per code run past a plan's
// allowance, shared by every agent.

const POINTS = [
  {
    title: 'One balance for your whole account',
    body: 'Your balance belongs to you, not to any single agent. Every agent you own, across all of your organizations, draws from it, including when people you have shared a private agent with use it.',
  },
  {
    title: 'You only pay for what is used',
    body: 'Each model call is charged for the tokens it reads and writes, at the rates above. Every plan also includes a monthly allowance of code runs; past it, each run is charged at the per-run price. All of it is deducted automatically, and the Usage tab shows where it goes, agent by agent.',
  },
  {
    title: 'Keep it above zero',
    body: 'When the balance reaches zero, the agents billed to it pause until you add funds. Monthly plans for personal and private agents are paid separately, on the Organizations tab.',
  },
];

export function HowBillingWorks() {
  return (
    <Card pad="1.35rem 1.4rem" style={{ background: `linear-gradient(180deg, ${C.brassTint} 0%, #FFFFFF 70%)` }}>
      <h2 style={{ fontFamily: MONO, fontSize: '0.68rem', fontWeight: 500, color: C.brassDeep, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 1rem' }}>How billing works</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.4rem' }}>
        {POINTS.map((p, i) => (
          <div key={p.title} style={{ display: 'flex', gap: '0.8rem' }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.brassWash, border: `1px solid ${C.brassLine}`, color: C.brassDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '0.68rem', flexShrink: 0 }}>{i + 1}</span>
            <div>
              <p style={{ fontSize: '0.88rem', fontWeight: 500, color: C.ink, margin: '0 0 0.35rem', letterSpacing: '-0.01em' }}>{p.title}</p>
              <p style={{ fontSize: '0.8rem', color: C.soft, lineHeight: 1.65, margin: 0 }}>{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
