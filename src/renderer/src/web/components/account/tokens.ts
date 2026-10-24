// components/account/tokens.ts
// The "Stone & Brass" palette as the Account area uses it: neutrals for chrome and text,
// brass for the brand accent, and a small status set (green / amber / red) for state.
// Same hexes the rest of the app already uses inline -- one place so the five Account
// pages stay in step.

export const C = {
  ink: '#26251E',
  body: '#3A3830',
  soft: '#67655A',
  muted: '#9E9C8F',
  faint: '#B9B4A2',
  line: '#E2DFD3',
  lineSoft: '#EFEDE3',
  surface: '#F7F6F2',
  paper: '#FBFAF7',
  card: '#FFFFFF',

  brass: '#A17F3A',
  brassDeep: '#7C5F27',
  brassWash: '#F6EBCB',
  brassTint: '#FBF6E6',
  brassLine: '#E4D2A0',

  green: '#3D7A4F',
  greenWash: '#E5F0E7',
  greenLine: '#8DBA9A',

  amber: '#B5651D',
  amberWash: '#F9E8D5',
  amberLine: '#D9A06A',

  red: '#B34A3C',
  redWash: '#F5E6E1',
  redLine: '#E3C4BB',

  slate: '#3D5A6E',
  slateWash: '#E8EEF2',
  slateLine: '#BFCCD6',
} as const;

export const MONO = "'IBM Plex Mono', monospace";
export const SANS = "'Inter', 'Helvetica Neue', sans-serif";
