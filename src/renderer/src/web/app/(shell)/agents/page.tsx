// app/(shell)/agents/page.tsx
export default function AgentsEmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, border: '1.5px dashed #C9C4B2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9C4B2', margin: '0 auto 1.25rem' }}>
          <svg width="22" height="22" viewBox="0 0 21 21" fill="none">
            <path d="M3 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3.5v-3.5H5a2 2 0 0 1-2-2v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
        <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.5rem' }}>Select an agent</p>
        <p style={{ fontSize: '0.82rem', color: '#9E9C8F', margin: 0, lineHeight: 1.6 }}>
          Pick one from the list, or create a new one to start chatting.
        </p>
      </div>
    </div>
  );
}
