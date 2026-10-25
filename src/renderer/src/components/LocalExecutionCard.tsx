// src/renderer/src/components/LocalExecutionCard.tsx
// Desktop-only. Lets the person run their agents' tool code on this PC (in a sealed Linux box) instead of the cloud.
import { useRunner } from '~/hooks/useRunner';
import { Button } from '~/components/ui';

const LABEL: Record<string, string> = {
  off: 'Off',
  'no-wsl': 'Needs Windows’ Linux support',
  'needs-install': 'Needs the Linux box',
  installing: 'Installing…',
  checking: 'Checking…',
  ready: 'Ready',
  busy: 'Running a tool',
  error: 'Needs attention',
};

const BROWSER_LABEL = { unavailable: 'Needs a newer Linux box', checking: 'Checking…', ready: 'Ready', error: 'Needs attention' } as const;

const row = { display: 'flex', justifyContent: 'space-between', gap: 24, padding: '11px 18px', borderBottom: '1px solid #E2DFD3', fontSize: 13.5 } as const;

export function LocalExecutionCard() {
  const { status, setEnabled, install } = useRunner();
  const tone = status.state === 'ready' || status.state === 'busy' ? '#3F6B4A' : status.state === 'error' || status.state === 'no-wsl' ? '#B4442A' : '#67655A';

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ margin: '0 0 4px', fontFamily: "'Newsreader', Georgia, serif", fontSize: 21, fontWeight: 500 }}>Run tools on this PC</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#9E9C8F', lineHeight: 1.5 }}>
        When this is on and ready, code your agents run for you is executed here, in a sealed Linux box that cannot see your files, instead of in the cloud.
        If this PC is off or busy, the cloud runs it as usual.
      </p>
      <div style={{ background: '#fff', border: '1px solid #E2DFD3', borderRadius: 10, overflow: 'hidden' }}>
        <div style={row}><span style={{ color: '#9E9C8F' }}>Status</span><span style={{ color: tone }}>{LABEL[status.state] ?? status.state}{status.state === 'installing' && status.percent !== undefined ? ` ${status.percent}%` : ''}</span></div>
        {status.deviceName ? <div style={row}><span style={{ color: '#9E9C8F' }}>This PC</span><span>{status.deviceName}</span></div> : null}
        {status.lastCanaryAt ? <div style={row}><span style={{ color: '#9E9C8F' }}>Last self-test</span><span>{new Date(status.lastCanaryAt).toLocaleTimeString()}</span></div> : null}
        {status.runnerVersion ? <div style={row}><span style={{ color: '#9E9C8F' }}>Linux box version</span><span>{status.runnerVersion}</span></div> : null}
        {status.browser ? (
          <div style={row}>
            <span style={{ color: '#9E9C8F' }}>Browsers</span>
            <span style={{ color: status.browser === 'ready' ? '#3F6B4A' : status.browser === 'error' ? '#B4442A' : '#67655A' }}>
              {BROWSER_LABEL[status.browser]}{status.browserSessions ? ` · ${status.browserSessions} open` : ''}
            </span>
          </div>
        ) : null}
        <div style={{ ...row, borderBottom: 'none' }}><span style={{ color: '#9E9C8F' }}>Tool runs here</span><span>{status.jobsRun ?? 0}</span></div>
      </div>
      {status.message ? <p style={{ margin: '10px 0 0', fontSize: 13, color: tone }}>{status.message}</p> : null}
      {status.browser === 'error' && status.browserNote ? <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#B4442A', lineHeight: 1.5 }}>Browser self-test: {status.browserNote}</p> : null}
      {status.state === 'no-wsl' ? (
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#67655A', lineHeight: 1.5 }}>
          Open PowerShell as administrator, run <code>wsl --install</code>, restart the PC, then switch this on again.
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {status.enabled
          ? <Button variant="secondary" label="Turn off" onClick={() => setEnabled(false)} />
          : <Button label="Turn on" onClick={() => setEnabled(true)} />}
        {status.enabled && status.state === 'needs-install' ? <Button label="Install the Linux box" onClick={install} /> : null}
      </div>
    </div>
  );
}
