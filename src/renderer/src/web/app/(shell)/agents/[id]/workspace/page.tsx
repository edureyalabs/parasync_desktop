// app/agents/[id]/workspace/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAgentCtx } from '../layout';
import { TabHeader } from '@/components/agent-ui/TabHeader';

interface Project {
  slug:        string;
  purpose:     string | null;
  updated_at:  string;
  file_count:  number;
}

interface WorkspaceFile {
  path:                  string;
  purpose:               string | null;
  tags:                  string[] | null;
  project:               string;
  is_generated_document: boolean | null;
  is_user_upload:        boolean | null;
  file_size_bytes:       number | null;
  mime_type:             string | null;
  updated_at:            string;
}

function Spinner({ size = 20, color = '#26251E' }: { size?: number; color?: string }) {
  return (
    <>
      <div style={{ width: size, height: size, border: `1.5px solid ${color === '#fff' ? 'rgba(255,255,255,0.3)' : '#DAD5C5'}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileKind = 'excel' | 'word' | 'pdf' | 'csv' | 'file';

function kindFromMime(mime: string | null): FileKind {
  const m = mime || '';
  if (m.includes('spreadsheetml')) return 'excel';
  if (m.includes('wordprocessingml')) return 'word';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('csv')) return 'csv';
  return 'file';
}

const KIND_COLOR: Record<FileKind, string> = {
  excel: '#1D6F42',
  word:  '#2B579C',
  pdf:   '#C4392B',
  csv:   '#4A7C59',
  file:  '#7C5F27',
};

function labelForFile(kind: FileKind, filename: string): string {
  if (kind === 'excel') return 'XLS';
  if (kind === 'word') return 'DOC';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'csv') return 'CSV';
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return 'FILE';
  return filename.slice(dot + 1, dot + 5).toUpperCase();
}

function FileIcon({ kind, filename, size = 18 }: { kind: FileKind; filename: string; size?: number }) {
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

function filenameFromPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

// Same forced-download pattern Attachments.tsx uses — fetch the signed URL,
// fetch the actual bytes, hand them to the browser as a blob with a
// `download` attribute, rather than navigating to the signed URL directly
// (which would let content-type decide inline-render vs. download, e.g. a
// PDF opening in the browser's own viewer instead of saving).
async function downloadFile(agentId: string, path: string, filename: string): Promise<void> {
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

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 3L5 7l4 4" stroke="#67655A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Project list ───────────────────────────────────────────────────────────

function ProjectGrid({ projects, onOpen }: { projects: Project[]; onOpen: (slug: string) => void }) {
  if (projects.length === 0) {
    return (
      <div style={{ border: '1px dashed #DAD5C5', borderRadius: 8, padding: '3rem 2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>
          Nothing here yet — files the agent saves for you (reports, generated documents, anything it pulls from a tool) will show up here as project folders.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
      {projects.map(p => (
        <button
          key={p.slug}
          onClick={() => onOpen(p.slug)}
          style={{
            textAlign: 'left', background: '#fff', border: '1px solid #E2DFD3', borderRadius: 6,
            padding: '1rem 1.1rem', cursor: 'pointer', font: 'inherit',
          }}
        >
          <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.35rem', letterSpacing: '-0.01em' }}>
            {p.slug}
          </p>
          {p.purpose && (
            <p style={{ fontSize: '0.78rem', color: '#67655A', margin: '0 0 0.5rem', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {p.purpose}
            </p>
          )}
          <p style={{ fontSize: '0.7rem', color: '#9E9C8F', margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>
            {p.file_count} file{p.file_count === 1 ? '' : 's'} · updated {new Date(p.updated_at).toLocaleDateString()}
          </p>
        </button>
      ))}
    </div>
  );
}

// ─── File list ──────────────────────────────────────────────────────────────

function FileList({ agentId, files, loading }: { agentId: string; files: WorkspaceFile[]; loading: boolean }) {
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  const handleDownload = async (f: WorkspaceFile) => {
    if (downloading.has(f.path)) return;
    setDownloading(prev => new Set(prev).add(f.path));
    try {
      await downloadFile(agentId, f.path, filenameFromPath(f.path));
    } finally {
      setDownloading(prev => { const next = new Set(prev); next.delete(f.path); return next; });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
        <Spinner />
      </div>
    );
  }
  if (files.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: '#9E9C8F', margin: 0 }}>No files in this project.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {files.map(f => {
        const filename = filenameFromPath(f.path);
        const kind = kindFromMime(f.mime_type);
        const isDownloading = downloading.has(f.path);
        return (
          <div
            key={f.path}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fff',
              border: '1px solid #E2DFD3', borderRadius: 6, padding: '0.7rem 0.9rem',
            }}
          >
            <FileIcon kind={kind} filename={filename} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.84rem', color: '#26251E', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {filename}
              </p>
              {f.purpose && (
                <p style={{ fontSize: '0.75rem', color: '#67655A', margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.purpose}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', color: '#9E9C8F', fontFamily: "'IBM Plex Mono',monospace" }}>
                  {formatBytes(f.file_size_bytes)} · {new Date(f.updated_at).toLocaleString()}
                </span>
                {f.is_generated_document && (
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: '#E3ECF0', color: '#3D5A6E', border: '1px solid #C7D8DF' }}>
                    generated
                  </span>
                )}
                {f.is_user_upload && (
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: '#EFE4C9', color: '#A17F3A', border: '1px solid #E4D2A0' }}>
                    your upload
                  </span>
                )}
                {(f.tags || []).filter(t => t !== 'user-upload').map(t => (
                  <span key={t} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: '#EDEBE2', color: '#67655A', border: '1px solid #E2DFD3' }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleDownload(f)}
              disabled={isDownloading}
              style={{
                flexShrink: 0, fontSize: '0.76rem', padding: '0.4rem 0.75rem', borderRadius: 5,
                border: '1px solid #E2DFD3', background: '#F7F6F2', color: '#26251E',
                cursor: isDownloading ? 'default' : 'pointer', opacity: isDownloading ? 0.6 : 1,
              }}
            >
              {isDownloading ? 'Downloading…' : 'Download'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
// Owner+member, view-only, per-viewer scoped — each viewer sees only their
// own sub-workspace (see the list route's own comment for why this can't be
// a direct browser Supabase query the way Watch Tower/Crons are). Two
// levels: project folders, then the files inside one, mirroring exactly how
// the agent itself organizes its own workspace_write calls.

export default function WorkspacePage() {
  const { agentId } = useAgentCtx();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [filesByProject, setFilesByProject] = useState<Record<string, WorkspaceFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/agents/${agentId}/workspace/list`);
      const data = await res.json();
      if (cancelled) return;
      setProjects(res.ok && data.ok ? data.projects : []);
      setLoadingProjects(false);
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const openProjectFiles = useCallback(async (slug: string) => {
    setOpenProject(slug);
    if (filesByProject[slug]) return;
    setLoadingFiles(true);
    const res = await fetch(`/api/agents/${agentId}/workspace/list?project=${encodeURIComponent(slug)}`);
    const data = await res.json();
    setFilesByProject(prev => ({ ...prev, [slug]: res.ok && data.ok ? data.files : [] }));
    setLoadingFiles(false);
  }, [agentId, filesByProject]);

  if (loadingProjects) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F2' }}>
        <Spinner />
      </div>
    );
  }

  const activeProject = projects.find(p => p.slug === openProject) || null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 2rem 2rem', background: '#F7F6F2' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <TabHeader
          title="Everything it's saved for you."
          subtitle="The agent's persistent files, organised into projects. View only: the agent creates and organises them as it works."
        />

        {activeProject === null ? (
          <ProjectGrid projects={projects} onOpen={openProjectFiles} />
        ) : (
          <div>
            <button
              onClick={() => setOpenProject(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none',
                cursor: 'pointer', padding: 0, marginBottom: '1rem', font: 'inherit',
              }}
            >
              <ChevronLeftIcon />
              <span style={{ fontSize: '0.8rem', color: '#67655A' }}>All projects</span>
            </button>
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '1rem', fontWeight: 500, color: '#26251E', margin: '0 0 0.2rem' }}>{activeProject.slug}</p>
              {activeProject.purpose && (
                <p style={{ fontSize: '0.8rem', color: '#67655A', margin: 0, lineHeight: 1.5 }}>{activeProject.purpose}</p>
              )}
            </div>
            <FileList agentId={agentId} files={filesByProject[activeProject.slug] || []} loading={loadingFiles} />
          </div>
        )}
      </div>
    </div>
  );
}
