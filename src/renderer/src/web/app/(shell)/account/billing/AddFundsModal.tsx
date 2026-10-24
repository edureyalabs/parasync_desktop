// app/(shell)/account/billing/AddFundsModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { fmtRate, fmtTokens } from '@/components/account/format';
import { fetchTokenPricing, tokensForUsd, type TokenPricing } from './tokenPricing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletContext {
  country:      string;
  currency:     'INR' | 'USD';
  symbol:       string;
  usdToInrRate: number | null;
}

// Minimal shape of the global Razorpay Checkout constructor — kept local to
// this file rather than a global .d.ts, since nothing else in the app needs it.
interface RazorpayCheckout {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

const PRESET_AMOUNTS_USD = [5, 10, 25, 50, 100];
const CHECKOUT_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Modal ────────────────────────────────────────────────────────────────────
// Payment is only ever actually confirmed server-side by the Razorpay
// webhook (app/api/wallet/razorpay-webhook), which credits the wallet
// regardless of whether this modal, this tab, or this browser session still
// exists by the time it fires. Everything below the Razorpay handler is a
// courtesy — a best-effort "wait and check" so a user who stays on the page
// sees their balance update without a manual refresh, not the mechanism
// that actually moves money.

export default function AddFundsModal({ currentBalance, onClose, onFundsAdded }: {
  currentBalance: number;
  onClose:        () => void;
  onFundsAdded:   (newBalance: number) => void;
}) {
  const [ctx, setCtx] = useState<WalletContext | null>(null);
  const [pricing, setPricing] = useState<TokenPricing | null>(null);
  const [amount, setAmount] = useState<number>(10);
  const [customAmount, setCustomAmount] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'pick' | 'waiting' | 'timeout'>('pick');
  const overlayRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    (async () => {
      try {
        const res = await fetch('/api/wallet/context');
        const data = await res.json();
        if (data.ok) setCtx(data);
      } catch {
        // Context is purely cosmetic (currency display) — payment still works
        // in USD-only mode if this fails, no need to block on it.
      }
    })();
    void fetchTokenPricing().then(setPricing);
    return () => {
      document.body.style.overflow = '';
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const isIndia = ctx?.currency === 'INR';
  const inrPreview = isIndia && ctx?.usdToInrRate
    ? Math.round(effectiveAmount * ctx.usdToInrRate)
    : null;

  const pollForBalance = async (startedFrom: number) => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    let attempts = 0;
    const maxAttempts = 10; // ~20s at 2s intervals — generous for webhook latency

    pollTimer.current = setInterval(async () => {
      attempts += 1;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase.from('wallets').select('balance_credits').eq('user_id', session.user.id).maybeSingle();
        const newBalance = data?.balance_credits ?? startedFrom;
        if (newBalance !== startedFrom) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          onFundsAdded(newBalance);
          return;
        }
      }
      if (attempts >= maxAttempts) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setPhase('timeout');
      }
    }, 2000);
  };

  const handlePay = async () => {
    if (!effectiveAmount || effectiveAmount < 1) { setError('Enter an amount of at least $1.'); return; }

    setStarting(true);
    setError('');

    try {
      const orderRes = await fetch('/api/wallet/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd: effectiveAmount }),
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

      const checkout = new window.Razorpay({
        key:      keyId,
        amount:   Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.orderId,
        name:     'ParaSync',
        description: `Add $${order.amountCredits} to your balance`,
        // Currency alone already keeps UPI/netbanking off a USD order (those
        // are INR-only rails) — this is belt-and-suspenders to guarantee
        // card-only for non-Indian users regardless of account config.
        ...(order.currency === 'USD' ? { method: { card: true, netbanking: false, wallet: false, upi: false, paylater: false, emi: false } } : {}),
        handler: () => {
          setStarting(false);
          setPhase('waiting');
          pollForBalance(currentBalance);
        },
        modal: {
          ondismiss: () => {
            setStarting(false);
          },
        },
        theme: { color: '#26251E' },
      });

      checkout.open();
      // starting stays true only until either handler or ondismiss fires —
      // the Razorpay modal itself is now the user's focus.
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
                  Add funds
                </p>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 500, letterSpacing: '-0.025em', color: '#26251E', margin: 0 }}>
                  Top up your wallet
                </h2>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67655A', padding: '2px', lineHeight: 1, marginLeft: '1rem' }} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {PRESET_AMOUNTS_USD.map(a => (
                <button
                  key={a}
                  onClick={() => { setAmount(a); setCustomAmount(''); }}
                  style={{
                    padding: '0.65rem', borderRadius: 6, fontSize: '0.85rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer',
                    border: `1px solid ${!customAmount && amount === a ? '#26251E' : '#DAD5C5'}`,
                    background: !customAmount && amount === a ? '#26251E' : '#fff',
                    color: !customAmount && amount === a ? '#F7F6F2' : '#3A3830',
                  }}
                >
                  ${a}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.68rem', color: '#3A3830', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
              Or enter a custom amount (USD)
            </label>
            <input
              type="number"
              min={1}
              max={2000}
              placeholder="e.g. 20"
              value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setError(''); }}
              style={{ width: '100%', padding: '0.55rem 0.7rem', fontSize: '0.875rem', fontFamily: "'Inter', sans-serif", color: '#26251E', background: '#fff', border: '1px solid #DAD5C5', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
            />

            {pricing && effectiveAmount >= 1 && (
              <div style={{ margin: '0.9rem 0 0', padding: '0.7rem 0.8rem', background: '#F7F6F2', border: '1px solid #E2DFD3', borderRadius: 6 }}>
                <p style={{ fontSize: '0.8rem', color: '#26251E', margin: 0, lineHeight: 1.55 }}>
                  ${effectiveAmount} buys about <strong style={{ fontWeight: 500 }}>{fmtTokens(tokensForUsd(effectiveAmount, pricing.inputPerMillionUsd))}</strong> tokens read or <strong style={{ fontWeight: 500 }}>{fmtTokens(tokensForUsd(effectiveAmount, pricing.outputPerMillionUsd))}</strong> written.
                </p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.66rem', color: '#67655A', margin: '0.3rem 0 0' }}>
                  ${fmtRate(pricing.inputPerMillionUsd)} / 1M read · ${fmtRate(pricing.outputPerMillionUsd)} / 1M written
                </p>
              </div>
            )}

            {isIndia && inrPreview !== null && (
              <p style={{ fontSize: '0.78rem', color: '#67655A', margin: '0.6rem 0 0' }}>
                ≈ ₹{inrPreview.toLocaleString('en-IN')} — charged in INR, all Indian payment methods available (UPI, cards, netbanking, wallets).
              </p>
            )}
            {!isIndia && (
              <p style={{ fontSize: '0.78rem', color: '#9E9C8F', margin: '0.6rem 0 0' }}>
                Charged in USD by card.
              </p>
            )}

            {error && (
              <p style={{ fontSize: '0.8rem', color: '#B34A3C', margin: '0.9rem 0 0', background: '#F5E6E1', border: '1px solid #E3C4BB', borderRadius: 4, padding: '0.5rem 0.75rem' }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ background: 'none', border: '1px solid #C9C4B2', color: '#3A3830', padding: '0.55rem 1.1rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: 'pointer', borderRadius: 4 }}>
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={starting || effectiveAmount < 1}
                style={{ background: '#26251E', color: '#F7F6F2', border: 'none', padding: '0.55rem 1.25rem', fontSize: '0.825rem', fontFamily: "'Inter', sans-serif", cursor: starting ? 'not-allowed' : 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: effectiveAmount < 1 ? 0.5 : 1 }}
              >
                {starting && <Spinner />}
                {starting ? 'Starting…' : `Pay ${isIndia && inrPreview !== null ? `₹${inrPreview.toLocaleString('en-IN')}` : `$${effectiveAmount || 0}`}`}
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
              Confirming with the payment provider and updating your balance — this takes a few seconds. You can close this and check back later; it&apos;ll be there either way.
            </p>
          </div>
        )}

        {phase === 'timeout' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.4rem' }}>Still confirming</p>
            <p style={{ fontSize: '0.82rem', color: '#67655A', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
              Your payment is still being confirmed on the backend — this can occasionally take a bit longer. Your balance will update automatically once it lands; refresh this page in a minute if you don&apos;t see it yet.
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
