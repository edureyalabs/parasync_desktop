// components/Attachments.tsx
'use client';

import { useState } from 'react';

// ─── Shared types ───────────────────────────────────────────────────────────

export interface MessageAttachment {
  path:        string;
  filename:    string;
  mime_type:   string;
  size_bytes:  number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type FileKind = 'excel' | 'word' | 'pdf' | 'file';

function kindFromMime(mime: string): FileKind {
  if (mime.includes('spreadsheetml')) return 'excel';
  if (mime.includes('wordprocessingml')) return 'word';
  if (mime.includes('pdf')) return 'pdf';
  return 'file';
}

// Matches each format's own brand color — recognizable at a glance, same
// association users already have from Office/Acrobat.
const KIND_COLOR: Record<FileKind, string> = {
  excel: '#1D6F42',
  word:  '#2B579C',
  pdf:   '#C4392B',
  file:  '#7C5F27',
};

const KIND_LABEL: Record<FileKind, string> = {
  excel: 'XLS',
  word:  'DOC',
  pdf:   'PDF',
  file:  '',
};

// For anything outside the three named formats, show the file's own
// extension rather than a generic label — a badge that's always blank or
// always says "FILE" isn't actually distinguishing anything.
function labelForFile(kind: FileKind, filename: string): string {
  if (kind !== 'file') return KIND_LABEL[kind];
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return 'FILE';
  return filename.slice(dot + 1, dot + 5).toUpperCase();
}

// A small colored badge with the extension's own short label — same idea as
// Drive/Dropbox file-type chips, and far more legible at chip size than a
// generic paper glyph that looks identical across every format.
function FileIcon({ kind, filename, size = 16 }: { kind: FileKind; filename: string; size?: number }) {
  const color = KIND_COLOR[kind];
  const label = labelForFile(kind, filename);
  return (
    <svg width={size * 1.3} height={size} viewBox="0 0 26 20" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="25" height="19" rx="4" fill={color} />
      <text
        x="13" y="14" textAnchor="middle"
        fontFamily="'IBM Plex Mono', monospace" fontSize={label.length > 3 ? 7 : 8}
        fontWeight={400} fill="#fff" letterSpacing="0.02em"
      >
        {label}
      </text>
    </svg>
  );
}

function Spinner({ size, color }: { size: number; color: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color}33`, borderTopColor: color, borderRadius: '50%', animation: 'attachment-spin 0.7s linear infinite', flexShrink: 0 }} />
      <style>{`@keyframes attachment-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

async function downloadAttachment(agentId: string, path: string, filename: string): Promise<void> {
  // Forced download via a fetched blob + synthetic <a download> click, rather
  // than navigating to (or opening a tab pointed at) the signed URL directly.
  // Navigating directly lets the browser decide what to do based on
  // content-type — for a PDF that means rendering it inline via the
  // browser's built-in viewer instead of downloading. Fetching the bytes
  // ourselves and handing them to the browser as a blob with a `download`
  // attribute forces a save regardless of content-type, in the current tab,
  // for every format alike.
  try {
    const res = await fetch(`/api/agents/${agentId}/workspace/download?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      alert('This file is no longer available.');
      return;
    }
    const { url } = await res.json();
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      alert('This file is no longer available.');
      return;
    }
    const blob = await fileRes.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    alert('Could not download this file — please try again.');
  }
}

// ─── Inline attachment chips ────────────────────────────────────────────────
// Rendered below the chat bubble (not inside it) — a compact row that wraps
// onto further rows once it runs out of width, one small chip per file.

// Defensive dedupe by `path`, independent of whatever produced `attachments`
// — the backend already dedupes before writing metadata, but this renders
// directly from data that could be old (written before that fix existed) or
// from a future source that makes the same mistake again. A duplicate path
// rendered twice in the chip row is also just confusing on its own (the same
// file appearing to exist twice), not only a React key-uniqueness crash
// (confirmed live, 2026-08-10: exactly that crashed this component). Keeps
// the LAST occurrence per path, same rule the backend's own dedupe uses.
function dedupeByPath(attachments: MessageAttachment[]): MessageAttachment[] {
  const byPath = new Map<string, MessageAttachment>();
  for (const a of attachments) {
    if (a?.path) byPath.set(a.path, a);
  }
  return Array.from(byPath.values());
}

export function AttachmentChips({ agentId, attachments: rawAttachments }: { agentId: string; attachments: MessageAttachment[] }) {
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  if (!rawAttachments?.length) return null;
  const attachments = dedupeByPath(rawAttachments);

  const handleClick = async (a: MessageAttachment) => {
    if (downloading.has(a.path)) return;
    setDownloading(prev => new Set(prev).add(a.path));
    try {
      await downloadAttachment(agentId, a.path, a.filename);
    } finally {
      setDownloading(prev => {
        const next = new Set(prev);
        next.delete(a.path);
        return next;
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
      {attachments.map(a => {
        const isDownloading = downloading.has(a.path);
        const kind = kindFromMime(a.mime_type);
        return (
          <button
            key={a.path}
            onClick={() => handleClick(a)}
            disabled={isDownloading}
            title={a.filename}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem', textAlign: 'left',
              background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6,
              padding: '0.3rem 0.55rem', cursor: isDownloading ? 'default' : 'pointer', maxWidth: 190,
              opacity: isDownloading ? 0.7 : 1,
            }}
          >
            {isDownloading
              ? <div style={{ width: 20.8, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={13} color={KIND_COLOR[kind]} />
                </div>
              : <FileIcon kind={kind} filename={a.filename} />
            }
            <span style={{ fontSize: '0.74rem', color: '#3A3830', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.filename}
            </span>
          </button>
        );
      })}
    </div>
  );
}
