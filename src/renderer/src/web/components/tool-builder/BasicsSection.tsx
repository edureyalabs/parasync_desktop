// components/tool-builder/BasicsSection.tsx
'use client';

import { C, MONO } from '@/components/account/tokens';
import { Field, IssueList, Panel } from './ui';

// Step 1: what the tool is called and what it is for. The name is what the agent calls it by; the description and context are what it reads when deciding
// whether to use it. The preview line shows the tool the way the agent will see it.
export function BasicsSection({ name, onName, description, onDescription, context, onContext, nameIssues, signature }: {
  name: string;
  onName: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  context: string;
  onContext: (v: string) => void;
  nameIssues: string[];
  signature: string;
}) {
  const call = signature.replace(/^def\s+run/, name.trim() || 'tool_name').replace(/:$/, '').replace(/=None/g, '?');
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <Panel icon="file-text" title="Name and description" description="Short and specific beats clever.">
        <div style={{ display: 'grid', gap: '1.05rem' }}>
          <Field label="Name" required hint="Lowercase letters, numbers and underscores. This is the name the agent calls the tool by." error={nameIssues[0]}>
            <input
              className="tool-field" value={name} onChange={e => onName(e.target.value)} placeholder="get_weather" aria-invalid={nameIssues.length > 0}
              style={{ fontFamily: MONO, fontSize: '0.84rem' }} spellCheck={false} autoComplete="off"
            />
          </Field>
          <Field label="Description" hint="One line on what it does.">
            <input className="tool-field" value={description} onChange={e => onDescription(e.target.value)} placeholder="Looks up the current weather for a city." />
          </Field>
          <Field label="When to use it" optional hint="Extra guidance for the agent: when to reach for this tool, and when not to.">
            <textarea className="tool-field" rows={3} value={context} onChange={e => onContext(e.target.value)} placeholder="Use this for current conditions only. For forecasts, use the forecast tool." style={{ resize: 'vertical' }} />
          </Field>
        </div>
        {nameIssues.length > 1 && <IssueList issues={nameIssues.slice(1)} />}
      </Panel>

      <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: '0.7rem 0.95rem', background: C.paper }}>
        <p style={{ fontFamily: MONO, fontSize: '0.62rem', color: C.muted, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 0.3rem' }}>How the agent sees it</p>
        <p style={{ fontFamily: MONO, fontSize: '0.8rem', color: C.ink, margin: 0, wordBreak: 'break-word' }}>{call}</p>
        <p style={{ fontSize: '0.78rem', color: C.soft, margin: '0.2rem 0 0' }}>{description.trim() || 'No description yet.'}</p>
      </div>
    </div>
  );
}
