// components/runsheet/tokens.ts
// Design tokens for the Runsheet's chain rail: one place for the bead states, the
// node-type accents and the palette (the same "Stone & Brass" hexes the rest of the
// app uses inline), so a node reads the same everywhere it appears -- the card strip,
// the expanded chain, and the planner's own steps.

export const INK = '#26251E';
export const MUTED = '#9E9C8F';
export const SOFT = '#67655A';
export const LINE = '#E2DFD3';
export const LINE_STRONG = '#DAD5C5';
export const SURFACE = '#F7F6F2';
export const PAPER = '#FBFAF7';

/** What a bead is doing. `building` / `ghost` only exist while the planner is still assembling the chain. */
export type BeadState =
  | 'idle'        // planned, nothing running
  | 'queued'      // a run is active and has not reached it yet
  | 'running'
  | 'completed'
  | 'failed'
  | 'recovering'  // failed, and the recovery engine is repairing it
  | 'skipped'     // the run ended before reaching it
  | 'building';   // just added by the planner

/** The picture inside a bead. Node types, planner actions and state badges share one set. */
export type GlyphKey =
  | 'tool' | 'llm' | 'agent' | 'deliver'          // node types
  | 'explore' | 'add' | 'replace' | 'remove' | 'finish' | 'think' | 'plan' // planner actions
  | 'check' | 'cross' | 'wrench';                  // badges

export const ACCENT: Record<GlyphKey, string> = {
  tool: '#3D5A6E',     // slate
  llm: '#7C5F27',      // brass
  agent: '#5F4A8C',    // violet
  deliver: '#3F7A5C',  // green-teal
  explore: '#67655A',
  add: '#3D5A6E',
  replace: '#B5651D',
  remove: '#9E5A50',
  finish: '#3D7A4F',
  think: '#9E9C8F',
  plan: '#3D5A6E',
  check: '#3D7A4F',
  cross: '#B34A3C',
  wrench: '#B5651D',
};

export interface StateStyle {
  /** glyph + badge colour once the bead has a status (null = keep the node-type accent) */
  fg: string | null;
  bg: string;
  ring: string;
  dashed: boolean;
  label: string;
}

export const STATE_STYLE: Record<BeadState, StateStyle> = {
  idle:       { fg: null,      bg: '#FFFFFF',  ring: '#DAD5C5', dashed: false, label: 'Planned' },
  queued:     { fg: null,      bg: SURFACE,   ring: '#C2BCA8', dashed: false, label: 'Queued' },
  running:    { fg: '#A17F3A', bg: '#F6EBCB', ring: '#C9A24D', dashed: false, label: 'Running' },
  completed:  { fg: '#3D7A4F', bg: '#E5F0E7', ring: '#8DBA9A', dashed: false, label: 'Completed' },
  failed:     { fg: '#B34A3C', bg: '#F5E6E1', ring: '#D9A196', dashed: false, label: 'Failed' },
  recovering: { fg: '#B5651D', bg: '#F9E8D5', ring: '#D9A06A', dashed: true,  label: 'Repairing' },
  skipped:    { fg: '#B9B4A2', bg: 'transparent', ring: '#DAD5C5', dashed: true, label: 'Not reached' },
  building:   { fg: null,      bg: '#FFFFFF',  ring: '#A9B7C1', dashed: false, label: 'Built' },
};

/** Chip colours for the state label in detail panels. */
export function stateChip(state: BeadState): { fg: string; bg: string; border: string } {
  const s = STATE_STYLE[state];
  return { fg: s.fg ?? SOFT, bg: s.bg === 'transparent' ? '#F0EEE5' : s.bg, border: s.ring };
}

export type SegmentKind = 'idle' | 'done' | 'flow' | 'dead' | 'repair' | 'build' | 'break';
