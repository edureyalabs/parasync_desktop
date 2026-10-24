// components/tool-builder/AssetsSection.tsx
'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { Btn, Notice, Panel, Spinner } from './ui';
import { MAX_ASSET_BYTES, formatBytes, type Tool, type ToolAsset } from './types';

// Build-time files staged into the sandbox under their own filename on EVERY run (bemain's tool_assets.py). Upload/delete write straight to Storage from the
// browser (agent-tool-assets' RLS grants owner/admin ALL) and persist the metadata into tools.config.assets in the same step: they don't wait for the main
// Save. Gated on the tool already existing: the storage path is keyed on its saved name.
export function AssetsSection({ orgId, agentId, existing, assets, onAssetsChange }: {
  orgId: string | undefined;
  agentId: string;
  existing: Tool | null;
  assets: ToolAsset[];
  onAssetsChange: (next: ToolAsset[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const basePath = existing && orgId ? `${orgId}/${agentId}/${existing.name}` : null;

  const persist = async (next: ToolAsset[]) => {
    if (!existing) return false;
    const supabase = createClient();
    const { error: dbErr } = await supabase.from('tools').update({ config: { ...existing.config, assets: next } }).eq('id', existing.id);
    return !dbErr;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !existing || !basePath) return;
    if (file.size > MAX_ASSET_BYTES) { setError(`"${file.name}" is over the ${formatBytes(MAX_ASSET_BYTES)} limit.`); return; }

    setUploading(true); setError('');
    const supabase = createClient();
    const { error: upErr } = await supabase.storage.from('agent-tool-assets').upload(`${basePath}/${file.name}`, file, { upsert: true });
    if (upErr) { setError(`Could not upload "${file.name}".`); setUploading(false); return; }

    const next = [...assets.filter(a => a.filename !== file.name), { filename: file.name, size_bytes: file.size }];
    const saved = await persist(next);
    setUploading(false);
    if (!saved) { setError('File uploaded, but could not save its record. Try attaching it again.'); return; }
    onAssetsChange(next);
  };

  const handleDelete = async (filename: string) => {
    if (!existing || !basePath) return;
    const supabase = createClient();
    await supabase.storage.from('agent-tool-assets').remove([`${basePath}/${filename}`]);
    const next = assets.filter(a => a.filename !== filename);
    if (await persist(next)) onAssetsChange(next);
  };

  return (
    <Panel
      icon="paperclip" color={C.soft} title="Attached files"
      description={<>Fixed files staged into the sandbox under their own name on <strong>every</strong> run, for every user: a helper module to <code>import</code>, a template, reference data. For a file the agent supplies per call, add a <strong>File</strong> input instead.</>}
      aside={existing ? (
        <>
          <input ref={fileInputRef} type="file" onChange={handleUpload} style={{ display: 'none' }} />
          <Btn size="sm" icon={uploading ? undefined : 'upload'} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading && <Spinner size={12} color="#3A3830" />}{uploading ? 'Uploading…' : 'Attach file'}
          </Btn>
        </>
      ) : undefined}
    >
      {!existing ? (
        <Notice tone="info">Save the tool once, then come back to attach files. They are stored under the tool&apos;s saved name.</Notice>
      ) : assets.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0 }}>No files attached.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          {assets.map(a => (
            <div key={a.filename} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.7rem', background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8 }}>
              <Icon name="file" size={14} color={C.soft} />
              <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: C.body, minWidth: 0, wordBreak: 'break-all' }}>{a.filename}</span>
              <span style={{ fontSize: '0.72rem', color: C.muted }}>{formatBytes(a.size_bytes)}</span>
              <button type="button" onClick={() => handleDelete(a.filename)} className="tbx-btn tbx-ghost tbx-sm" style={{ marginLeft: 'auto' }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ fontSize: '0.75rem', color: C.red, margin: '0.6rem 0 0' }}>{error}</p>}
    </Panel>
  );
}
