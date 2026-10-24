// src/renderer/src/shims/codemirror.tsx
// Placeholder for the code editor the Tool Builder uses, until that screen is brought over: a plain monospace text box
// with the same basic props. Replaced by the real editor package when the Tool Builder phase starts.
import type { CSSProperties } from 'react';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
  placeholder?: string;
  editable?: boolean;
  readOnly?: boolean;
  basicSetup?: unknown;
  extensions?: unknown[];
  theme?: unknown;
  style?: CSSProperties;
}

export default function CodeMirror({ value = '', onChange, height, minHeight, maxHeight, placeholder, editable = true, readOnly = false, style }: Props) {
  return (
    <textarea
      value={value} placeholder={placeholder} readOnly={readOnly || !editable} spellCheck={false}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ width: '100%', height: height ?? '240px', minHeight, maxHeight, boxSizing: 'border-box', fontFamily: "'IBM Plex Mono', Consolas, monospace", fontSize: 13, lineHeight: 1.55, padding: 12, border: '1px solid #DAD5C5', borderRadius: 6, background: '#fff', color: '#26251E', resize: 'vertical', ...style }}
    />
  );
}
