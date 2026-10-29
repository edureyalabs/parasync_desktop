// src/renderer/src/components/SetupGuide.tsx
// Desktop-only. A short, plain guide to getting this PC ready to run tools: what to type in PowerShell or Command Prompt, in order, with a Copy button
// on every command. It opens by itself when the card says something is missing.
import { useState } from 'react';

const MONO = "'IBM Plex Mono', Consolas, monospace";

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* the text is selectable: it can be copied by hand */ }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 2px', background: '#26251E', borderRadius: 7, padding: '7px 8px 7px 12px' }}>
      <code style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12.5, color: '#F7F6F2', overflowX: 'auto', whiteSpace: 'pre', userSelect: 'text' }}>{text}</code>
      <button
        type="button" onClick={() => void copy()} className="ps-press"
        style={{ flexShrink: 0, height: 24, padding: '0 10px', border: '1px solid #55523F', borderRadius: 6, background: copied ? '#3F6B4A' : 'transparent', color: '#F7F6F2', fontSize: 11.5, cursor: 'pointer' }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: n === 1 ? 'none' : '1px solid #ECE9DE' }}>
      <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#EFE4C9', color: '#514726', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.55, color: '#3A3830' }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
        {children}
      </div>
    </li>
  );
}

const note = { margin: '4px 0 0', fontSize: 12.5, color: '#67655A', lineHeight: 1.55 } as const;

export function SetupGuide({ open }: { open: boolean }) {
  return (
    <details open={open} style={{ marginTop: 14, background: '#fff', border: '1px solid #E2DFD3', borderRadius: 10, padding: '0 16px' }}>
      <summary style={{ cursor: 'pointer', padding: '12px 0', fontSize: 13.5, fontWeight: 500, color: '#26251E' }}>Set-up guide: get this PC ready, step by step</summary>
      <ol style={{ listStyle: 'none', margin: 0, padding: '0 0 6px' }}>
        <Step n={1} title="Open a terminal">
          <p style={note}>Press the Windows key, type <b>PowerShell</b>, right-click it and choose <b>Run as administrator</b>. (Command Prompt works too: type <b>cmd</b> instead.)</p>
        </Step>
        <Step n={2} title="See if Windows already has Linux support">
          <Command text="wsl --status" />
          <p style={note}>If it shows <b>Default Version: 2</b>, skip to step 4. If it says WSL is not installed, or the command is not recognised, go on to step 3.</p>
        </Step>
        <Step n={3} title="Install it, then restart the PC">
          <Command text="wsl --install --no-distribution" />
          <p style={note}>Restart Windows when it finishes. Afterwards, in a terminal again:</p>
          <Command text="wsl --update" />
          <p style={note}>If it fails with <b>0x80370102</b>, or says virtualization is off, switch on <b>Intel VT-x</b> or <b>AMD-V (SVM)</b> in the PC&rsquo;s BIOS / UEFI settings. You can check the current setting with:</p>
          <Command text='systeminfo | findstr /C:"Virtualization Enabled In Firmware"' />
        </Step>
        <Step n={4} title="Switch it on here and install the Linux box">
          <p style={note}>In this window, press <b>Turn on</b>, then <b>Install the Linux box</b>. It is a one-time download from Parasync&rsquo;s public release; Parasync&rsquo;s box is its own sealed Linux system and does not touch your files or your other Linux systems. When it finishes, the status turns <b>Ready</b>.</p>
        </Step>
        <Step n={5} title="Check that it is there (optional)">
          <Command text="wsl --list --verbose" />
          <p style={note}>You should see <b>ParasyncRunner</b> in the list.</p>
        </Step>
        <Step n={6} title="If something is stuck">
          <p style={note}>Stop everything Linux on this PC, then press <b>Turn off</b> and <b>Turn on</b> here:</p>
          <Command text="wsl --shutdown" />
          <p style={note}>To start the Parasync box from scratch (this removes only Parasync&rsquo;s box, then press <b>Install the Linux box</b> again):</p>
          <Command text="wsl --unregister ParasyncRunner" />
        </Step>
      </ol>
    </details>
  );
}
