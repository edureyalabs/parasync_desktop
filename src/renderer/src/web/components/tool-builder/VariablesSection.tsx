// components/tool-builder/VariablesSection.tsx
'use client';

import { Icon } from '@/components/icons/Icon';
import { C, MONO } from '@/components/account/tokens';
import { TYPE_ICON } from './meta';
import { Btn, IconTile, Panel } from './ui';
import {
  ITEM_TYPES, TYPE_OPTIONS, emptyVariable, isFileType, parseDefault, splitList, typeLabel,
  type DataType, type ItemType, type StringFormat, type ToolVariable,
} from './types';

const SIMPLE_DEFAULT_TYPES: DataType[] = ['string', 'integer', 'number', 'boolean', 'enum', 'date', 'datetime', 'time'];

function defaultToText(v: ToolVariable): string {
  return v.default === undefined || v.default === null ? '' : String(v.default);
}

const smallLabel: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', color: C.soft };

function VariableRow({ v, index, onChange, onRemove }: {
  v: ToolVariable;
  index: number;
  onChange: (patch: Partial<ToolVariable>) => void;
  onRemove: () => void;
}) {
  // The raw text being typed lives on the variable itself (_defaultText etc., editor-only, stripped on save) so a row holds no state of its own, and
  // removing a row from the middle can't leave another row showing its neighbour's text.
  const defaultText = v._defaultText ?? defaultToText(v);
  const optionsText = v._optionsText ?? (v.options ?? []).join(', ');
  const acceptText = v._acceptText ?? (v.accept ?? []).join(', ');
  const defaultInvalid = !parseDefault(v.data_type, defaultText).ok;
  const canDefault = SIMPLE_DEFAULT_TYPES.includes(v.data_type);
  const hasExtras = v.data_type === 'enum' || v.data_type === 'list' || v.data_type === 'string' || isFileType(v.data_type) || canDefault;

  const commitDefault = (raw: string) => {
    const parsed = parseDefault(v.data_type, raw);
    onChange(parsed.ok ? { _defaultText: raw, default: parsed.value } : { _defaultText: raw });
  };
  const changeType = (next: DataType) => onChange({ data_type: next, default: undefined, _defaultText: '' });

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.paper, padding: '0.8rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <IconTile icon={TYPE_ICON[v.data_type]} color={C.slate} size={30} />
        <input
          className="tool-field tool-field-sm" aria-label={`Input ${index + 1} name`} placeholder="input_name" spellCheck={false} autoComplete="off"
          value={v.name} onChange={e => onChange({ name: e.target.value })} style={{ flex: '1 1 150px', width: 'auto', minWidth: 0, fontFamily: MONO }}
        />
        <select className="tool-field tool-field-sm" aria-label={`Input ${index + 1} type`} value={v.data_type} onChange={e => changeType(e.target.value as DataType)} style={{ flex: '0 1 170px', width: 'auto' }}>
          {v.data_type === 'json' && <option value="json">{typeLabel('json')}</option>}
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label style={{ ...smallLabel, cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={v.required} onChange={e => onChange({ required: e.target.checked })} style={{ accentColor: C.ink }} />
          Required
        </label>
        <button type="button" onClick={onRemove} aria-label={`Remove input ${v.name || index + 1}`} title="Remove" className="tbx-btn tbx-ghost tbx-sm" style={{ padding: '0.3rem' }}>
          <Icon name="trash" size={14} />
        </button>
      </div>

      <input
        className="tool-field tool-field-sm" aria-label={`Input ${index + 1} description`} placeholder="Tell the agent what to pass here"
        value={v.context} onChange={e => onChange({ context: e.target.value })} style={{ marginTop: '0.55rem' }}
      />

      {hasExtras && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem 1rem', alignItems: 'center', marginTop: '0.55rem' }}>
          {v.data_type === 'enum' && (
            <input
              className="tool-field tool-field-sm" style={{ flex: '1 1 260px', width: 'auto' }} aria-label="Choices"
              placeholder="Choices, comma-separated (draft, final)" value={optionsText}
              onChange={e => onChange({ _optionsText: e.target.value, options: splitList(e.target.value) })}
            />
          )}
          {v.data_type === 'list' && (
            <label style={smallLabel}>
              Each item is
              <select className="tool-field tool-field-sm" style={{ width: 'auto' }} value={v.item_type ?? 'string'} onChange={e => onChange({ item_type: e.target.value as ItemType })}>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </select>
            </label>
          )}
          {v.data_type === 'string' && (
            <label style={smallLabel}>
              Must be
              <select className="tool-field tool-field-sm" style={{ width: 'auto' }} value={v.format ?? ''} onChange={e => onChange({ format: e.target.value as StringFormat })}>
                <option value="">any text</option>
                <option value="email">an email address</option>
                <option value="url">a URL</option>
                <option value="uuid">a UUID</option>
              </select>
            </label>
          )}
          {isFileType(v.data_type) && (
            <input
              className="tool-field tool-field-sm" style={{ flex: '1 1 260px', width: 'auto' }} aria-label="Allowed file types"
              placeholder="Allowed file types (optional), e.g. .xlsx, .csv" value={acceptText}
              onChange={e => onChange({ _acceptText: e.target.value, accept: splitList(e.target.value) })}
            />
          )}
          {canDefault && (v.data_type === 'boolean' ? (
            <label style={smallLabel}>
              Default
              <select className="tool-field tool-field-sm" style={{ width: 'auto' }} value={defaultText} onChange={e => commitDefault(e.target.value)}>
                <option value="">none</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          ) : (
            <label style={smallLabel}>
              Default
              <input
                className="tool-field tool-field-sm" style={{ width: 150 }} aria-invalid={defaultInvalid}
                placeholder="none" value={defaultText} onChange={e => commitDefault(e.target.value)}
              />
            </label>
          ))}
        </div>
      )}
      {isFileType(v.data_type) && (
        <p style={{ margin: '0.55rem 0 0', fontSize: '0.72rem', color: C.soft, lineHeight: 1.55 }}>
          The agent passes a workspace file path{v.data_type === 'file_list' ? ' (or several)' : ''}. The file is staged in the sandbox and your code receives its path: open it with <code>open(path)</code>.
        </p>
      )}
    </div>
  );
}

export function VariablesSection({ variables, onChange, issues }: {
  variables: ToolVariable[];
  onChange: (next: ToolVariable[]) => void;
  issues?: string[];
}) {
  const update = (idx: number, patch: Partial<ToolVariable>) =>
    onChange(variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const add = () => onChange([...variables, emptyVariable()]);

  return (
    <Panel
      icon="list-checks" color={C.slate} title="Inputs"
      description="What the agent, or a task step, passes in each time it calls the tool."
      aside={variables.length > 0 ? <Btn size="sm" icon="plus" onClick={add}>Add input</Btn> : undefined}
    >
      {variables.length === 0 ? (
        <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 10, padding: '1.6rem 1rem', textAlign: 'center', background: C.paper }}>
          <p style={{ fontSize: '0.84rem', color: C.ink, fontWeight: 500, margin: '0 0 0.25rem' }}>No inputs</p>
          <p style={{ fontSize: '0.78rem', color: C.soft, margin: '0 0 0.9rem' }}>The tool takes no arguments. Add an input if it needs something from the agent.</p>
          <Btn icon="plus" onClick={add}>Add an input</Btn>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {variables.map((v, idx) => (
            <VariableRow key={idx} v={v} index={idx} onChange={patch => update(idx, patch)} onRemove={() => onChange(variables.filter((_, i) => i !== idx))} />
          ))}
        </div>
      )}
      {issues && issues.length > 0 && (
        <div style={{ marginTop: '0.7rem' }}>{issues.map((m, i) => <p key={i} style={{ fontSize: '0.74rem', color: C.red, margin: i ? '0.2rem 0 0' : 0 }}>{m}</p>)}</div>
      )}
    </Panel>
  );
}
