// components/AgentAvatar.tsx
function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

// A thin brass ring set off from the picture by a light gap, plus a soft shadow: lifts a small avatar off the header so
// a light or transparent logo does not blend into the page.
const ringShadow = (color: string, gap: string) => `0 0 0 2px ${gap}, 0 0 0 3px ${color}, 0 2px 6px rgba(38,37,30,0.22)`;

export function AgentAvatar({ name, avatarUrl, size = 40, fontSize, bordered = false, ring = false, ringColor = '#A17F3A', ringGap = '#F7F6F2' }: {
  name:       string;
  avatarUrl?: string | null;
  size?:      number;
  fontSize?:  string;
  bordered?:  boolean;
  ring?:      boolean;
  ringColor?: string;   // the ring itself (brass by default)
  ringGap?:   string;   // the gap between picture and ring: match the surface the avatar sits on
}) {
  const border = bordered ? '1px solid #DAD5C5' : 'none';
  const boxShadow = ring ? ringShadow(ringColor, ringGap) : undefined;
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URLs, no static import list to feed next/image
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#EDEBE2', border, boxShadow, boxSizing: 'border-box' }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#26251E', color: '#F7F6F2',
      display: 'flex', alignItems: 'center', justifyContent: 'center', border, boxShadow, boxSizing: 'border-box',
      fontFamily: "'IBM Plex Mono',monospace", fontSize: fontSize ?? `${Math.max(10, size * 0.32)}px`, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}
