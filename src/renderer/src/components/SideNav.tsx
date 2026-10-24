// src/renderer/src/components/SideNav.tsx
import { Icon, type IconName } from '@/components/Icon';
import { C } from '@/lib/theme';

export interface SideNavItem<K extends string> {
  key: K;
  label: string;
  icon: IconName;
}

/** The second column of a section (as in the web app): a title and a vertical list of pages. */
export function SideNav<K extends string>({ title, subtitle, items, active, onPick }: { title: string; subtitle?: string; items: SideNavItem<K>[]; active: K; onPick: (key: K) => void }) {
  return (
    <section style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRight: `1px solid ${C.line}` }}>
      <div style={{ padding: '18px 16px 12px' }}>
        <h1 style={{ margin: 0, fontFamily: "'Newsreader', Georgia, serif", fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.soft, overflowWrap: 'anywhere' }}>{subtitle}</p>}
      </div>
      <nav aria-label={title} style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {items.map((it) => {
          const on = it.key === active;
          return (
            <button
              key={it.key} onClick={() => onPick(it.key)} aria-current={on ? 'page' : undefined} className={on ? undefined : 'ps-hover'}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: 'none', borderRadius: 8, padding: '11px 12px', marginBottom: 2, cursor: 'pointer', fontSize: 14, fontWeight: on ? 600 : 500, color: on ? C.ink : C.text, background: on ? C.brassBg : 'transparent' }}
            >
              <Icon name={it.icon} size={18} color={on ? C.brassDeep : C.soft} />
              {it.label}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
