// src/renderer/src/views/agent/WorkspaceTab.tsx
// Your own files with this agent: project folders, then the files inside one. Each person sees only their own workspace.
import { useState } from 'react';

import { Button, Chip } from '@/components/ui';
import { Empty, Loaded, Panel, Row, TabPage } from '@/components/agent/kit';
import { Icon } from '@/components/Icon';
import { useAsync } from '@/hooks/useAsync';
import { apiGet, downloadFile } from '@/lib/api';
import { fmtBytes } from '@/lib/format';
import { C } from '@/lib/theme';
import type { TabProps } from '@/views/agent/types';

interface Project { slug: string; purpose: string | null; updated_at: string; file_count: number }
interface FileRow { path: string; purpose: string | null; project: string; is_generated_document: boolean | null; is_user_upload: boolean | null; file_size_bytes: number | null; updated_at: string }

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Files({ agentId, slug }: { agentId: string; slug: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const state = useAsync<FileRow[]>(async () => {
    const res = await apiGet<{ ok: boolean; files?: FileRow[] }>(`/api/agents/${agentId}/workspace/list`, { project: slug });
    if (!res.ok) throw new Error(res.error);
    return res.data.files ?? [];
  }, [agentId, slug]);

  const save = async (f: FileRow) => {
    setBusy(f.path); setNote(null);
    const result = await downloadFile(`/api/agents/${agentId}/workspace/download`, { path: f.path }, f.path.split('/').pop() ?? 'file');
    setBusy(null);
    if (result.state === 'failed') setNote(result.message);
  };

  return (
    <Loaded state={state}>
      {(files) => (
        <Panel>
          {note && <div style={{ padding: '10px 18px', fontSize: 12.5, color: C.red, background: C.redBg, borderBottom: `1px solid ${C.redLine}` }}>{note}</div>}
          {files.length === 0 ? <Empty>No files in this project.</Empty> : files.map((f, i) => (
            <Row
              key={f.path} last={i === files.length - 1} leading={<Icon name="paperclip" size={17} color={C.soft} />}
              primary={f.path.split('/').slice(1).join('/') || f.path}
              secondary={`${f.purpose ? `${f.purpose} · ` : ''}${[fmtBytes(f.file_size_bytes), when(f.updated_at)].filter(Boolean).join(' · ')}`}
              right={<>{f.is_generated_document && <Chip label="Made by the agent" tone="brass" />}{f.is_user_upload && <Chip label="You uploaded" />}<Button variant="secondary" icon="download" label="Save" loading={busy === f.path} onClick={() => void save(f)} /></>}
            />
          ))}
        </Panel>
      )}
    </Loaded>
  );
}

export function WorkspaceTab({ agentId }: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const state = useAsync<Project[]>(async () => {
    const res = await apiGet<{ ok: boolean; projects?: Project[] }>(`/api/agents/${agentId}/workspace/list`);
    if (!res.ok) throw new Error(res.error);
    return res.data.projects ?? [];
  }, [agentId]);

  return (
    <TabPage title="Workspace" subtitle="Files the agent saved for you: reports, documents, anything it pulled from a tool. Only you can see yours.">
      {open ? (
        <>
          <div><Button variant="secondary" label="← All projects" onClick={() => setOpen(null)} /></div>
          <h2 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>{open}</h2>
          <Files agentId={agentId} slug={open} />
        </>
      ) : (
        <Loaded state={state}>
          {(projects) => (
            <Panel>
              {projects.length === 0 ? <Empty>Nothing here yet. Files the agent saves for you show up as project folders.</Empty> : projects.map((p, i) => (
                <Row
                  key={p.slug} last={i === projects.length - 1} leading={<Icon name="folder" size={19} color={C.brass} />} onClick={() => setOpen(p.slug)}
                  primary={p.slug} secondary={`${p.purpose ? `${p.purpose} · ` : ''}updated ${when(p.updated_at)}`}
                  right={<Chip label={`${p.file_count} file${p.file_count === 1 ? '' : 's'}`} />}
                />
              ))}
            </Panel>
          )}
        </Loaded>
      )}
    </TabPage>
  );
}
