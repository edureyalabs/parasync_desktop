// components/browser-access/SkillsPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { Btn, Chip, ErrorText, IconTile } from './ui';
import type { Skill } from './types';

// The Skills tab: tested scripts the study learned from finished tasks. Planning agents see the list and fetch the one they need.

const SKILL_TONE: Record<Skill['status'], 'green' | 'brass' | 'red'> = { verified: 'green', unverified: 'brass', stale: 'red' };

export function SkillsPanel({ accessId }: { accessId: string }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.from('browser_access_skills')
        .select('id, name, title, when_to_use, params, script, returns, gotchas, status, evidence_count, last_confirmed_at, enabled, version, updated_at')
        .eq('access_id', accessId).order('name', { ascending: true });
      setSkills((data as Skill[]) ?? []);
    };
    load();
    const channel = supabase.channel(`browser-access-skills-${accessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'browser_access_skills', filter: `access_id=eq.${accessId}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accessId]);

  const setEnabled = async (skill: Skill) => {
    setError('');
    const { error: updateError } = await createClient().from('browser_access_skills').update({ enabled: !skill.enabled }).eq('id', skill.id);
    if (updateError) { setError('Could not change that skill.'); return; }
    setSkills(list => list.map(s => (s.id === skill.id ? { ...s, enabled: !skill.enabled } : s)));
  };

  const remove = async (skill: Skill) => {
    if (!window.confirm(`Delete the skill "${skill.name}"? A later study can learn it again from new tasks.`)) return;
    setError('');
    const { error: deleteError } = await createClient().from('browser_access_skills').delete().eq('id', skill.id);
    if (deleteError) { setError('Could not delete that skill.'); return; }
    setSkills(list => list.filter(s => s.id !== skill.id));
  };

  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      <p style={{ fontSize: '0.74rem', color: C.soft, margin: 0, lineHeight: 1.55 }}>
        A skill is a script that already worked on this site, with its inputs and what it returns. Planning agents fetch the one they need instead of writing it again. <strong>Verified</strong> means it ran successfully inside a finished task. Switch a skill off to hide it.
      </p>
      {skills.length === 0 && (
        <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: '1.2rem', textAlign: 'center', background: C.paper }}>
          <p style={{ fontSize: '0.8rem', color: C.soft, margin: 0 }}>No skills yet. They are learned from finished tasks.</p>
        </div>
      )}
      {skills.map(skill => {
        const isOpen = open === skill.id;
        return (
          <div key={skill.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '0.6rem 0.8rem', display: 'grid', gap: '0.4rem', opacity: skill.enabled ? 1 : 0.55, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <IconTile icon="zap" color={skill.status === 'stale' ? C.red : C.brassDeep} size={26} />
              <span style={{ fontFamily: MONO, fontSize: '0.78rem', color: C.ink }}>{skill.name}</span>
              <Chip tone={SKILL_TONE[skill.status]}>{skill.status}{skill.status === 'verified' && skill.evidence_count > 0 ? ` · ${skill.evidence_count} task${skill.evidence_count === 1 ? '' : 's'}` : ''}</Chip>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.35rem' }}>
                <Btn icon={isOpen ? 'chevron-down' : 'chevron-right'} onClick={() => setOpen(isOpen ? null : skill.id)}>{isOpen ? 'Hide' : 'View'}</Btn>
                <Btn onClick={() => setEnabled(skill)}>{skill.enabled ? 'Switch off' : 'Switch on'}</Btn>
                <Btn variant="danger" onClick={() => remove(skill)} aria-label={`Delete ${skill.name}`}><Icon name="trash" size={12} /></Btn>
              </span>
            </div>
            <p style={{ fontSize: '0.76rem', color: C.body, margin: 0, lineHeight: 1.55 }}>{skill.when_to_use}</p>
            {isOpen && (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {skill.params.length > 0 && (
                  <p style={{ fontSize: '0.72rem', color: C.soft, margin: 0, lineHeight: 1.55 }}>
                    <b>Inputs:</b> {skill.params.map(p => `${p.name}${p.required === false ? ' (optional)' : ''}${p.description ? ` — ${p.description}` : ''}`).join('; ')}
                  </p>
                )}
                {skill.returns && <p style={{ fontSize: '0.72rem', color: C.soft, margin: 0, lineHeight: 1.55 }}><b>Returns:</b> {skill.returns}</p>}
                {skill.gotchas && <p style={{ fontSize: '0.72rem', color: C.soft, margin: 0, lineHeight: 1.55 }}><b>Watch out:</b> {skill.gotchas}</p>}
                <pre style={{ margin: 0, background: C.paper, border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: '0.6rem 0.8rem', fontFamily: MONO, fontSize: '0.7rem', lineHeight: 1.5, overflow: 'auto', maxHeight: 320, whiteSpace: 'pre' }}>{skill.script}</pre>
                <p style={{ fontSize: '0.68rem', color: C.muted, margin: 0 }}>Version {skill.version} · updated {new Date(skill.updated_at).toLocaleString()}</p>
              </div>
            )}
          </div>
        );
      })}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
