// components/tool-builder/OutputSection.tsx
'use client';

import { C } from '@/components/account/tokens';
import { OUTPUT_ICON } from './meta';
import { Field, IconTile, Panel } from './ui';
import type { OutputKind, ToolOutput } from './types';

const KINDS: { value: OutputKind; label: string; help: string }[] = [
  { value: 'value',          label: 'A value',            help: 'run() returns a number, text, list or dictionary.' },
  { value: 'file',           label: 'A file',             help: 'run() saves a file in the output/ folder.' },
  { value: 'value_and_file', label: 'A value and a file', help: 'Both: return a value and save a file in output/.' },
];

export function OutputSection({ output, onChange }: { output: ToolOutput; onChange: (next: ToolOutput) => void }) {
  return (
    <Panel icon="package" color={C.green} title="Result" description="A file is saved to the workspace automatically. The result carries its path, and a task step can pass it on to the next step.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.65rem', marginBottom: '1.05rem' }}>
        {KINDS.map(k => (
          <button key={k.value} type="button" className="tbx-choice" aria-pressed={output.kind === k.value} onClick={() => onChange({ ...output, kind: k.value })}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.4rem' }}>
              <IconTile icon={OUTPUT_ICON[k.value]} color={output.kind === k.value ? C.brassDeep : C.soft} size={28} />
              <span style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink }}>{k.label}</span>
            </span>
            <span style={{ display: 'block', fontSize: '0.74rem', color: C.soft, lineHeight: 1.5 }}>{k.help}</span>
          </button>
        ))}
      </div>
      <Field label="Describe the result" hint="Shown to the agent and the task planner.">
        <input className="tool-field" value={output.description} onChange={e => onChange({ ...output, description: e.target.value })} placeholder="A dictionary with the row count and the total" />
      </Field>
    </Panel>
  );
}
