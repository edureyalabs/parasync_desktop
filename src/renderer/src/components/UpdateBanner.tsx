// src/renderer/src/components/UpdateBanner.tsx
import { useUpdates } from '~/hooks/useUpdates';

/** A small notice in the corner while an update downloads, with "Restart to update" once it is ready. It floats, so it never moves the web's layout. */
export function UpdateBanner() {
  const { status, install } = useUpdates();
  if (status.state !== 'downloading' && status.state !== 'ready' && status.state !== 'available') return null;

  const text =
    status.state === 'ready' ? `Parasync ${status.version} is ready to install.`
    : status.state === 'downloading' ? `Downloading update${status.version ? ` ${status.version}` : ''}… ${status.percent}%`
    : `Update ${status.version} found, downloading…`;

  return (
    <div role="status" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#EFE4C9', border: '1px solid #E4D2A0', borderRadius: 10, boxShadow: '0 6px 20px rgba(38,37,30,0.18)', fontSize: 12.5, color: '#514726', fontFamily: "'Inter', sans-serif" }}>
      <span>{text}</span>
      {status.state === 'ready' && (
        <button onClick={install} style={{ border: 'none', background: '#26251E', color: '#F7F6F2', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
          Restart to update
        </button>
      )}
    </div>
  );
}
