// components/tool-builder/CodeSection.tsx
'use client';

import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { Chip, IssueList, Panel } from './ui';

// Step 4: the Python. The `def run(...)` line is generated from the inputs and shown above the editor (the author never edits it); optional imports and
// helper functions go in their own editor above it. Problems from the checks sit under the editor, with line numbers.
export function CodeSection({ signature, preamble, onPreambleChange, body, onBodyChange, bodyIssues, preambleIssues, warnings }: {
  signature: string;
  preamble: string;
  onPreambleChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  bodyIssues: string[];
  preambleIssues: string[];
  warnings: string[];
}) {
  const [showPreamble, setShowPreamble] = useState(preamble.trim().length > 0);

  return (
    <Panel
      icon="terminal" color={C.slate} title="Python"
      description={<>Runs in a fresh, isolated sandbox with the standard library, <code>pip</code> packages, file access and open network access. To produce a file, save it in the <code>output/</code> folder, e.g. <code>open(&quot;output/report.xlsx&quot;, &quot;wb&quot;)</code>.</>}
    >
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <Chip tone="slate">Python 3</Chip><Chip tone="slate">Network on</Chip><Chip tone="slate">pandas · numpy · requests ready</Chip><Chip tone="slate">output/ saves files</Chip>
      </div>

      <button
        type="button" onClick={() => setShowPreamble(s => !s)} aria-expanded={showPreamble}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: C.brassDeep, fontSize: '0.78rem', fontFamily: "'Inter',sans-serif", cursor: 'pointer', padding: 0, marginBottom: '0.7rem' }}
      >
        <span style={{ display: 'inline-flex', transform: showPreamble ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s' }}><Icon name="chevron-right" size={13} /></span>
        Imports and helper functions <span style={{ color: C.muted }}>(optional)</span>
      </button>
      {showPreamble && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ border: '1px solid #DAD5C5', borderRadius: 8, overflow: 'hidden' }}>
            <CodeMirror
              value={preamble} height="120px" extensions={[python()]} onChange={onPreambleChange}
              basicSetup={{ lineNumbers: true, tabSize: 4 }} style={{ fontSize: '0.82rem' }}
              placeholder={'import json\n\ndef helper(x):\n    return x'}
            />
          </div>
          <IssueList issues={preambleIssues} />
        </div>
      )}

      <div style={{ border: '1px solid #DAD5C5', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#EDEBE2', padding: '0.5rem 0.8rem', borderBottom: '1px solid #DAD5C5', fontFamily: MONO, fontSize: '0.8rem', color: C.soft }}>
          <Icon name="lock" size={12} />
          <span style={{ wordBreak: 'break-word' }}>{signature}</span>
          <span style={{ marginLeft: 'auto', fontFamily: "'Inter',sans-serif", fontSize: '0.68rem', color: C.muted, whiteSpace: 'nowrap' }}>generated from your inputs</span>
        </div>
        <CodeMirror value={body} height="300px" extensions={[python()]} onChange={onBodyChange} basicSetup={{ lineNumbers: true, tabSize: 4 }} style={{ fontSize: '0.82rem' }} />
      </div>
      <IssueList issues={bodyIssues} />
      <IssueList issues={warnings} tone="warning" />
    </Panel>
  );
}
