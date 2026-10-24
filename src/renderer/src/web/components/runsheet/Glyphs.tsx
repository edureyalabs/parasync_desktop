// components/runsheet/Glyphs.tsx
// The small icons inside a bead: node types, planner actions and state badges, drawn with the app's shared icon set (components/icons) so a chain
// node, a planner step and the Platform Tools list all speak one icon language. A tool node uses the tool's own picture instead (components/icons/toolIcons).
import { Icon, type IconName } from '@/components/icons/Icon';
import type { GlyphKey } from './tokens';

const GLYPH_ICON: Record<GlyphKey, IconName> = {
  tool: 'zap',
  llm: 'sparkles',
  agent: 'bot',
  deliver: 'send',
  explore: 'search',
  add: 'plus',
  replace: 'arrow-left-right',
  remove: 'minus',
  finish: 'flag',
  think: 'ellipsis',
  plan: 'clipboard-list',
  check: 'check',
  cross: 'x',
  wrench: 'wrench',
};

export function Glyph({ name, size = 14, strokeWidth = 1.75 }: { name: GlyphKey; size?: number; strokeWidth?: number }) {
  return <Icon name={GLYPH_ICON[name]} size={size} strokeWidth={strokeWidth} />;
}
