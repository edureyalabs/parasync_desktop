// components/browser-jobs/StepDetail.tsx
'use client';

import { CodeBlock } from '@/components/runsheet/CodeBlock';
import { prettyJson } from '@/components/runsheet/chainModel';
import { RunsheetStyles } from '@/components/runsheet/RunsheetStyles';
import { BRASS, GREEN, INK, LINE, MONO, MUTED, RED, SOFT } from '@/components/projects/tokens';
import type { BrowserJobStep } from './types';

// What one step of a Browser Access job looked like, opened under its bead: what the model wrote that turn (its plan or remarks), what it was given and
// what came back or went wrong. The same layout as a task planner turn.
export default function StepDetail({ step }: { step: BrowserJobStep }) {
  const failed = step.status === 'failed';
  const accent = failed ? '#B34A3C' : step.kind === 'finish' ? '#3D7A4F' : '#3D5A6E';
  return (
    <div style={{ marginTop: '0.6rem', background: '#F7F6F2', border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '0.7rem 0.85rem 0.8rem', animation: 'rsSlide .18s ease-out' }}>
      <RunsheetStyles />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: INK }}>{step.step_number}. {step.title}</span>
        <span style={{ fontFamily: MONO, fontSize: '0.58rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: failed ? RED : step.kind === 'finish' ? GREEN : BRASS }}>
          {failed ? 'failed' : step.kind === 'finish' ? 'result' : step.status}
        </span>
      </div>

      {step.note && (
        <div style={{ marginTop: '0.55rem' }}>
          <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em' }}>What the model wrote</span>
          <p style={{ fontSize: '0.78rem', color: SOFT, margin: '0.2rem 0 0', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{step.note}</p>
        </div>
      )}
      {step.input_excerpt && <CodeBlock label="Given" text={prettyJson(step.input_excerpt)} />}
      {step.output_excerpt && <CodeBlock label={step.kind === 'finish' ? 'Outcome' : 'Result'} text={prettyJson(step.output_excerpt)} maxHeight={320} />}
      {step.error && <CodeBlock label="Error" text={step.error} tone="error" />}
      {!step.note && !step.input_excerpt && !step.output_excerpt && !step.error && (
        <p style={{ fontSize: '0.74rem', color: MUTED, margin: '0.55rem 0 0' }}>Nothing was recorded for this step.</p>
      )}
    </div>
  );
}
