// components/icons/Icon.tsx
import { createElement } from 'react';
import { BRAND_ICONS, LINE_ICONS, type BrandIconName, type LineIconName, type Shape } from './iconData';

// One icon component for the whole app's tool / node pictures: outline icons that take the current text colour, plus a few solid brand marks.
// Purely decorative by default (aria-hidden); callers put the meaning in a label or title next to it.

export type IconName = LineIconName | BrandIconName;

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function Icon({ name, size = 16, strokeWidth = 1.75, color, style }: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** defaults to the surrounding text colour (currentColor) */
  color?: string;
  style?: React.CSSProperties;
}) {
  if (name in BRAND_ICONS) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color ?? 'currentColor'} aria-hidden="true" style={{ display: 'block', flexShrink: 0, ...style }}>
        <path d={BRAND_ICONS[name as BrandIconName]} />
      </svg>
    );
  }
  const shapes: readonly Shape[] = LINE_ICONS[name as LineIconName];
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {shapes.map(([tag, attrs], i) => createElement(tag, { key: i, ...Object.fromEntries(Object.entries(attrs).map(([k, v]) => [camel(k), v])) }))}
    </svg>
  );
}
