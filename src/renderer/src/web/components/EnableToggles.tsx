// components/EnableToggles.tsx
'use client';

const rowLabelStyle = (dim: boolean): React.CSSProperties => ({
  fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.62rem', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: dim ? '#C7C4B4' : '#9E9C8F',
});

function ToggleRow({
  label, on, disabled, pending, onClick, title,
}: {
  label: string; on: boolean; disabled: boolean; pending?: boolean; onClick: () => void; title: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.85rem', padding: '0.4rem 0.6rem' }}>
      <span style={rowLabelStyle(disabled)}>{label}</span>
      <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        style={{ width: 32, height: 18, borderRadius: 9, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: on ? '#26251E' : '#DAD5C5', position: 'relative', flexShrink: 0, opacity: pending ? 0.6 : 1 }}
      >
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
      </button>
    </div>
  );
}

interface EnableTogglesProps {
  enabled:         boolean;
  onToggleEnabled: () => void;
  enabledPending?: boolean;
  showForUsers:    boolean;
  forUsersEnabled: boolean;
  onToggleForUsers: () => void;
  forUsersPending?: boolean;
}

// Both of a tool/instruction/connector/etc.'s enable switches, stacked inside
// one thin-bordered box — "For Self" (does the owner/agent itself have this)
// on top, "For Users" (is it also available to connected users) below.
// Replaces the earlier layout (2026-08-29) of two separate, unlabeled/
// same-row toggles that didn't read clearly as "these are two different
// questions about the same thing." "For Users" is inert (greyed out,
// unclickable) until "For Self" is on — it has no effect otherwise, so the
// row shouldn't invite clicking it. Used identically across Platform Tools,
// Tool Builder, Instructions, Connectors, Signed APIs, and MCP.
export function EnableToggles({
  enabled, onToggleEnabled, enabledPending,
  showForUsers, forUsersEnabled, onToggleForUsers, forUsersPending,
}: EnableTogglesProps) {
  const forUsersInert = !enabled || !!forUsersPending;
  return (
    <div style={{ border: '1px solid #E2DFD3', borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#fff' }}>
      <ToggleRow
        label="For Self"
        on={enabled}
        disabled={!!enabledPending}
        pending={enabledPending}
        onClick={onToggleEnabled}
        title={enabled ? 'Disable' : 'Enable'}
      />
      {showForUsers && (
        <>
          <div style={{ height: 1, background: '#E2DFD3' }} />
          <ToggleRow
            label="For Users"
            on={forUsersEnabled && enabled}
            disabled={forUsersInert}
            pending={forUsersPending}
            onClick={onToggleForUsers}
            title={
              !enabled
                ? 'Turn on "For Self" first to make it available to connected users'
                : forUsersEnabled ? 'Enabled for connected users — click to make owner-only' : 'Owner-only — click to enable for connected users'
            }
          />
        </>
      )}
    </div>
  );
}
