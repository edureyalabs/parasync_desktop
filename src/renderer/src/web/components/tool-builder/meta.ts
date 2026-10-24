// components/tool-builder/meta.ts
import type { IconName } from '@/components/icons/Icon';
import type { DataType, OutputKind } from './types';

// The six steps of the editor, in the order a tool is built: describe it, say what goes in, say what comes out, write the code, set what it may use, then
// test it and save. The rail on the left lists them; every step can be opened at any time, the order is a guide, not a lock.

export type StepId = 'basics' | 'inputs' | 'output' | 'code' | 'access' | 'test';

export interface StepMeta {
  id: StepId;
  title: string;
  /** one line under the title in the rail */
  caption: string;
  /** the heading of the step itself */
  heading: string;
  /** what the step is for */
  purpose: string;
  icon: IconName;
  optional?: boolean;
}

export const STEPS: StepMeta[] = [
  { id: 'basics', title: 'Basics', caption: 'Name and purpose', heading: 'Describe the tool',
    purpose: 'The agent sees this name and description when it decides whether to use the tool, so say plainly what it does and when to reach for it.', icon: 'file-text' },
  { id: 'inputs', title: 'Inputs', caption: 'What the agent passes in', heading: 'What does the tool take?',
    purpose: 'Each input becomes a typed argument of your function. The platform checks and converts what it receives before your code runs.', icon: 'list-checks' },
  { id: 'output', title: 'Output', caption: 'What comes back', heading: 'What does the tool return?',
    purpose: 'Shown to the agent and to the task planner so they know what to expect, and how a task step can use the result.', icon: 'package' },
  { id: 'code', title: 'Code', caption: 'Python', heading: 'Write the code',
    purpose: 'Tick the secrets your code needs, then write it. The function line is generated from your inputs: write what happens inside it and return the result.', icon: 'terminal' },
  { id: 'access', title: 'Files & limits', caption: 'Files, packages, time', heading: 'Files, packages and limits',
    purpose: 'Everything here is optional. Attach fixed files and packages, and set how long the tool may run.', icon: 'sliders-horizontal', optional: true },
  { id: 'test', title: 'Test & save', caption: 'Run it, then save', heading: 'Test it, then save',
    purpose: 'A test runs your draft exactly like a real call, so a passing test means a passing run. Save when you are happy.', icon: 'flask-conical' },
];

export const TYPE_ICON: Record<DataType, IconName> = {
  string: 'type', integer: 'hash', number: 'hash', boolean: 'toggle-left', enum: 'chevrons-up-down', date: 'calendar', datetime: 'calendar-clock', time: 'clock',
  list: 'list', object: 'braces', file: 'file', file_list: 'files', json: 'braces',
};

export const OUTPUT_ICON: Record<OutputKind, IconName> = { value: 'braces', file: 'file', value_and_file: 'package' };
