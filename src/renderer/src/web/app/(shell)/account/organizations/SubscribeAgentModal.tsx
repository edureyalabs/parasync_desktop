// app/(shell)/account/organizations/SubscribeAgentModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

// Same Razorpay Checkout pattern as billing/AddFundsModal.tsx — see that
// file's own comments for why payment confirmation is entirely server-side
// (the webhook), never trusted from this modal's own success callback.

interface RazorpayCheckout {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
export const MONTHLY_RATE_USD: Record<string, number> = { personal: 10, private: 20 };

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return; }
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Spinner({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

export default function SubscribeAgentModal({ agentId, agentName, visibility, onClose, onSubscribed }: {
  agentId:      string;
  agentName:    string;
  visibility:   string;
  onClose:      () => void;
  onSubscribed: (newPeriodEnd: string) => void;
}) {
  const [months, setMonths] = useState(1);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'pick' | 'waiting' | 'timeout'>('pick');
  const [currency, setCurrency] = useState<{ symbol: string; currency: 'INR' | 'USD'; usdToInrRate: number | null } | null>(null);
  // Code runs the plan includes every month (read from the agent's allowance, which the owner may see even before subscribing).
  const [includedRuns, setIncludedRuns] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const rate = MONTHLY_RATE_USD[visibility] ?? 0;
  const amountUsd = rate * months;

  useEffect(() => {
    (async () => {
      const { data } = await createClient().rpc('compute_quota_status', { p_agent_id: agentId });
      const included = Number((data as { included?: number } | null)?.included);
      if (Number.isFinite(included) && included > 0) setIncludedRuns(included);
    })();
  }, [agentId]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    (async () => {
      try {
        const res = await fetch('/api/wallet/context');
        const data = await res.json();
        if (data.ok) setCurrency(data);
      } catch {
        // Purely cosmetic — payment still works in USD-only mode if this fails.
      }
    })();
    return () => {
      document.body.style.overflow = '';
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const isIndia = currency?.currency === 'INR';
  const inrPreview = isIndia && currency?.usdToInrRate ? Math.round(amountUsd * currency.usdToInrRate) : null;

  const pollForActivation = async (startedFromEnd: string | null) => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let attempts = 0;
    const maxAttempts = 10; // ~20s at 2s intervals — generous for webhook latency

    pollTimer.current = setInterval(async () => {
      attempts += 1;
      const { data } = await supabase.from('agent_subscriptions').select('current_period_end').eq('agent_id', agentId).maybeSingle();
      const newEnd = data?.current_period_end ?? null;
      if (newEnd && newEnd !== startedFromEnd) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        onSubscribed(newEnd);
        return;
      }
      if (attempts >= maxAttempts) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setPhase('timeout');
      }
    }, 2000);
  };

  const handlePay = async () => {
    if (!Number.isInteger(months) || months < 1) { setError('Enter a whole number of months (1 or more).'); return; }

    setStarting(true);
    setError('');

    try {
      const orderRes = await fetch('/api/subscriptions/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, months }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok || !order.ok) {
        setError(order.error || 'Could not start the payment. Please try again.');
        setStarting(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setError('Could not load the payment form. Check your connection and try again.');
        setStarting(false);
        return;
      }

      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) {
        setError('Payments are not configured yet.');
        setStarting(false);
        return;
      }

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: existing } = await supabase.from('agent_subscriptions').select('current_period_end').eq('agent_id', agentId).maybeSingle();
      const startedFromEnd = existing?.current_period_end ?? null;

      const checkout = new window.Razorpay({
        key:      keyId,
        amount:   Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.orderId,
        name:     'ParaSync',
        description: `${months} month(s) subscription — ${agentName}`,
        ...(order.currency === 'USD' ? { method: { card: true, netbanking: false, wallet: false, upi: false, paylater: false, emi: false } } : {}),
        handler: () => {
          setStarting(false);
          setPhase('waiting');
          pollForActivation(startedFromEnd);
        },
        modal: { ondismiss: () => setStarting(false) },
        theme: { color: '#26251E' },
      });

      checkout.open();
    } catch {
      setError('Something went wrong starting the payment. Please try again.');
      setStarting(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current && phase !== 'waiting') onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(10,10,10,0.35)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 8, padding: '2rem', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        {phase === 'pick' && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#67655A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
                  Subscribe
                </p>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
                  {agentName}
                </h2>
                <p style={{ fontSize: '0.78rem', color: '#67655A', margin: '0.3rem 0 0' }}>
                  ${rate}/month · {visibility} agent
                </p>
                {includedRuns !== null && (
                  <p style={{ fontSize: '0.74rem', color: '#67655A', margin: '0.3rem 0 0', lineHeight: 1.5 }}>
                    Includes {includedRuns.toLocaleString('en-US')} code runs every month{visibility === 'private' ? ', shared by everyone connected' : ''}; extra runs are paid from your balance.
                  </p>
                )}
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>

            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Number of months
            </label>
            <input
              type="number"
              min={1}
              max={24}
              step={1}
              value={months}
              onChange={e => { setMonths(Math.max(1, Math.round(Number(e.target.value) || 1))); setError(''); }}
              style={{ width: '100%', padding: '0.55rem 0.7rem', fontSize: '0.875rem', fontFamily: "'Inter', sans-serif", color: '#26251E', background: '#fff', border: '1px solid #DAD5C5', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
            />

            <p style={{ fontSize: '0.78rem', color: '#67655A', margin: '0.6rem 0 0' }}>
              {isIndia && inrPreview !== null
                ? `≈ ₹${inrPreview.toLocaleString('en-IN')} — charged in INR.`
                : `$${amountUsd} — charged in USD by card.`}
            </p>

            {error && (
              <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={starting || months < 1}
                style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: starting ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: months < 1 ? 0.5 : 1 }}
              >
                {starting && <Spinner />}
                {starting ? 'Starting…' : `Pay ${isIndia && inrPreview !== null ? `₹${inrPreview.toLocaleString('en-IN')}` : `$${amountUsd}`}`}
              </button>
            </div>
          </>
        )}

        {phase === 'waiting' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <Spinner size={28} color="#26251E" />
            </div>
            <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.4rem' }}>Payment received</p>
            <p style={{ fontSize: '0.82rem', color: '#67655A', margin: 0, lineHeight: 1.6 }}>
              Confirming with the payment provider and activating the subscription — this takes a few seconds.
            </p>
          </div>
        )}

        {phase === 'timeout' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.4rem' }}>Still confirming</p>
            <p style={{ fontSize: '0.82rem', color: '#67655A', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
              Your payment is still being confirmed on the backend. Refresh this page in a minute if you don&apos;t see it activated yet.
            </p>
            <button onClick={onClose} style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
