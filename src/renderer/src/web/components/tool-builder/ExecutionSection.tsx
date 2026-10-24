// components/tool-builder/ExecutionSection.tsx
'use client';

import { C } from '@/components/account/tokens';
import { Field, Panel, Toggle } from './ui';
import { MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS } from './types';

// Two panels of the "Files & limits" step: how the tool runs (time limit, extra packages) and whether the task planner may run it while designing a task.
export function ExecutionSection({ timeoutSeconds, onTimeoutChange, packagesText, onPackagesChange, safeForPlanning, onSafeForPlanningChange }: {
  timeoutSeconds: number;
  onTimeoutChange: (n: number) => void;
  packagesText: string;
  onPackagesChange: (v: string) => void;
  safeForPlanning: boolean;
  onSafeForPlanningChange: (v: boolean) => void;
}) {
  return (
    <>
      <Panel icon="timer" color={C.slate} title="Runtime" description="Every run starts a fresh sandbox with full network access. numpy, pandas, requests, openpyxl and other common packages are already installed.">
        <div style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ width: 150 }}>
            <Field label="Time limit (seconds)" hint={`${MIN_TIMEOUT_SECONDS} to ${MAX_TIMEOUT_SECONDS}. The run is stopped after this.`}>
              <input className="tool-field" type="number" min={MIN_TIMEOUT_SECONDS} max={MAX_TIMEOUT_SECONDS} value={timeoutSeconds} onChange={e => onTimeoutChange(Number(e.target.value))} />
            </Field>
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <Field label="Extra pip packages" optional hint="Installed on every run, which adds time. List only what isn't already available.">
              <textarea
                className="tool-field" rows={2} style={{ resize: 'vertical' }} spellCheck={false}
                placeholder={'one per line, e.g.\nboto3\npandas==2.2.0'} value={packagesText} onChange={e => onPackagesChange(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel icon="shield-check" color={C.green} title="Task planning" description="Whether the task planner may run this tool for real while it designs a task, for example to check a schema or test a query.">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
          <Toggle on={safeForPlanning} onClick={() => onSafeForPlanningChange(!safeForPlanning)} label="Safe for planning" />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '0.84rem', fontWeight: 500, color: C.ink, margin: '0 0 0.2rem' }}>Safe for planning <span style={{ color: C.muted, fontWeight: 400 }}>· read-only tools</span></p>
            <p style={{ fontSize: '0.76rem', color: C.soft, margin: 0, lineHeight: 1.6 }}>
              Turn this on only for tools that just read or look things up, and never send, write, delete or change anything. When off, the planner sees the description and the tool runs only when the task itself runs.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
