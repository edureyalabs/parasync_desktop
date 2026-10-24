// components/runsheet/CodeBlock.tsx
'use client';

import { useState } from 'react';
import { MUTED } from './tokens';

/** A labelled, scrollable, copyable block for an input / result / error excerpt. */
export function CodeBlock({ label, text, tone = 'neutral', maxHeight = 220 }: { label: string; text: string; tone?: 'neutral' | 'error'; maxHeight?: number }) {
  const [copied, setCopied] = useState(false);
  const colors = tone === 'error'
    ? { bg: '#F5E6E1', border: '#E3C4BB', fg: '#8A382D', label: '#B34A3C' }
    : { bg: '#F7F6F2', border: '#E2DFD3', fg: '#3A3830', label: MUTED };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable (insecure context / permissions): nothing to do
    }
  };

  return (
    <div style={{ marginTop: '0.55rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', color: colors.label, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        <button
          type="button" onClick={copy}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', color: copied ? '#3D7A4F' : MUTED, letterSpacing: '0.04em' }}
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre
        style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.71rem', lineHeight: 1.5, color: colors.fg, margin: 0,
          background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 4, padding: '0.5rem 0.65rem',
          maxHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      >
        {text}
      </pre>
    </div>
  );
}
