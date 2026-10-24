// src/renderer/src/components/UpdateBanner.tsx
import { useUpdates } from '@/hooks/useUpdates';
import { C } from '@/lib/theme';

/** A slim bar at the top while an update downloads, and a "Restart to update" button once it is ready. */
export function UpdateBanner() {
  const { status, install } = useUpdates();
  if (status.state !== 'downloading' && status.state !== 'ready' && status.state !== 'available') return null;

  const text =
    status.state === 'ready' ? `Parasync ${status.version} is ready to install.`
    : status.state === 'downloading' ? `Downloading update${status.version ? ` ${status.version}` : ''}… ${status.percent}%`
    : `Update ${status.version} found, downloading…`;

  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '6px 14px', background: C.brassBg, borderBottom: `1px solid ${C.brassLine}`, fontSize: 12.5, color: C.brassDeep, flexShrink: 0 }}>
      <span>{text}</span>
      {status.state === 'ready' && (
        <button onClick={install} style={{ border: 'none', background: C.ink, color: C.bg, borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          Restart to update
        </button>
      )}
    </div>
  );
}
