// components/tool-builder/types.ts
// Shared types + pure helpers for the Tool Builder (v2, 2026-09-29). The type
// list and the coercion rules mirror bemain's tool_types.py — that file is the
// source of truth; this one only needs enough to build the editor and to
// generate `def run(...)`.

export type DataType =
  | 'string' | 'integer' | 'number' | 'boolean' | 'enum'
  | 'date' | 'datetime' | 'time'
  | 'list' | 'object' | 'file' | 'file_list'
  | 'json'; // legacy catch-all — still read, no longer offered for new variables

export type ItemType = 'string' | 'integer' | 'number' | 'boolean';
export type StringFormat = '' | 'email' | 'url' | 'uuid';
export type OutputKind = 'value' | 'file' | 'value_and_file';

export const TYPE_OPTIONS: { value: Exclude<DataType, 'json'>; label: string }[] = [
  { value: 'string',    label: 'Text' },
  { value: 'integer',   label: 'Whole number' },
  { value: 'number',    label: 'Decimal number' },
  { value: 'boolean',   label: 'True / false' },
  { value: 'enum',      label: 'Choice (dropdown)' },
  { value: 'date',      label: 'Date' },
  { value: 'datetime',  label: 'Date & time' },
  { value: 'time',      label: 'Time' },
  { value: 'list',      label: 'List' },
  { value: 'object',    label: 'Object (JSON)' },
  { value: 'file',      label: 'File' },
  { value: 'file_list', label: 'Files (list)' },
];

export const ITEM_TYPES: ItemType[] = ['string', 'integer', 'number', 'boolean'];

export interface ToolVariable {
  name:      string;
  data_type: DataType;
  context:   string;
  required:  boolean;
  default?:  unknown;
  options?:  string[];      // enum
  item_type?: ItemType;     // list
  accept?:   string[];      // file / file_list — e.g. ['.xlsx']
  format?:   StringFormat;  // string
  // Legacy (pre-v2): read and mapped to file/file_list by upgradeVariable.
  is_workspace_file_path?: boolean;
  // Editor-only raw text being typed (a half-typed number, "a, b" before it is
  // split). Never saved — cleanVariable() rebuilds the variable without them.
  _defaultText?: string;
  _optionsText?: string;
  _acceptText?: string;
}

export interface ToolAsset {
  filename:   string;
  size_bytes: number;
}

export interface ToolOutput {
  kind:        OutputKind;
  description: string;
}

export interface ToolConfig {
  schema_version?: number;
  context:    string;
  code:       string;        // the generated `def run(...)` function
  preamble?:  string;        // optional module-level imports/helpers, above run()
  entrypoint: 'run';
  variables:  ToolVariable[];
  secrets:    string[];
  packages?:  string[];
  timeout_seconds?: number;
  output?:    ToolOutput;
  assets?:    ToolAsset[];
  safe_for_planning?: boolean; // task planner may call this tool while planning (read-only tools only)
  needs_internet_access?: boolean; // legacy — ignored, network access is always on
}

export interface Tool {
  id:                    string;
  name:                  string;
  description:           string | null;
  type:                  'custom' | 'platform';
  config:                ToolConfig;
  enabled:               boolean;
  available_to_members:  boolean;
  created_at:            string;
}

export const CONFIG_SCHEMA_VERSION = 2;
export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MIN_TIMEOUT_SECONDS = 5;
export const MAX_TIMEOUT_SECONDS = 400;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;

export const DEFAULT_BODY = `result = None
return result`;

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
  'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
  'raise', 'return', 'try', 'while', 'with', 'yield',
]);

export function isValidParamName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !PY_KEYWORDS.has(name);
}

export function isFileType(t: DataType): boolean {
  return t === 'file' || t === 'file_list';
}

export function emptyVariable(): ToolVariable {
  return { name: '', data_type: 'string', context: '', required: true };
}

// Maps a stored (possibly pre-v2) variable onto the current shape.
export function upgradeVariable(v: ToolVariable): ToolVariable {
  const out: ToolVariable = { ...v };
  if (out.is_workspace_file_path && !isFileType(out.data_type)) {
    out.data_type = out.data_type === 'json' || out.data_type === 'list' ? 'file_list' : 'file';
  }
  delete out.is_workspace_file_path;
  return out;
}

// Drops the per-type extras that don't apply to the variable's current type, so
// switching a variable from "Choice" to "Text" doesn't leave stale `options`
// behind in the saved config.
export function cleanVariable(v: ToolVariable): ToolVariable {
  const out: ToolVariable = { name: v.name.trim(), data_type: v.data_type, context: v.context.trim(), required: v.required };
  if (v.default !== undefined && v.default !== null && v.default !== '') out.default = v.default;
  if (v.data_type === 'enum') out.options = (v.options ?? []).map(o => o.trim()).filter(Boolean);
  if (v.data_type === 'list') out.item_type = v.item_type ?? 'string';
  if (isFileType(v.data_type)) {
    const accept = (v.accept ?? []).map(a => a.trim()).filter(Boolean);
    if (accept.length) out.accept = accept;
    delete out.default;
  }
  if (v.data_type === 'string' && v.format) out.format = v.format;
  if (v.data_type === 'list' || v.data_type === 'object') delete out.default;
  return out;
}

// `def run(...)`: required parameters first, then optional ones with a `None`
// default (Python requires it). bemain always calls run() by keyword with every
// declared variable, so the order here is display-only.
export function orderedParamNames(variables: ToolVariable[]): string[] {
  const named = variables.filter(v => v.name.trim());
  return [...named.filter(v => v.required), ...named.filter(v => !v.required)].map(v => v.name.trim());
}

export function buildSignature(variables: ToolVariable[]): string {
  const named = variables.filter(v => v.name.trim());
  const required = named.filter(v => v.required).map(v => v.name.trim());
  const optional = named.filter(v => !v.required).map(v => `${v.name.trim()}=None`);
  return `def run(${[...required, ...optional].join(', ')}):`;
}

// Combines the generated signature with the author's plain (unindented) body into
// the function the sandbox runs.
export function buildFullCode(variables: ToolVariable[], body: string): string {
  const indented = body
    .split('\n')
    .map(line => (line.trim() === '' ? '' : '    ' + line))
    .join('\n')
    .replace(/\n+$/, '');
  return `${buildSignature(variables)}\n${indented || '    pass'}\n`;
}

// Best-effort split of saved full code back into the editor's bare body. Falls back
// to the whole text when it doesn't look like the generated shape, so nothing is
// ever silently discarded.
export function extractBody(code: string): string {
  const lines = code.replace(/\n+$/, '').split('\n');
  if (lines.length === 0) return DEFAULT_BODY;
  if (!/^def\s+run\s*\(.*\)\s*:\s*$/.test(lines[0].trim())) return code;

  const rest = lines.slice(1);
  const indents = rest.filter(l => l.trim() !== '').map(l => (l.match(/^(\s*)/)?.[0].length ?? 0));
  const minIndent = indents.length ? Math.min(...indents) : 0;
  const body = rest.map(l => l.slice(minIndent)).join('\n').trim();
  return body === 'pass' || body === '' ? DEFAULT_BODY : body;
}

export function splitList(text: string): string[] {
  return text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function typeLabel(t: DataType): string {
  return TYPE_OPTIONS.find(o => o.value === t)?.label ?? (t === 'json' ? 'JSON (legacy)' : t);
}

// A typed default from the text the author entered; null means "not valid for
// this type" (the caller shows an inline error).
export function parseDefault(t: DataType, raw: string): { ok: true; value: unknown } | { ok: false } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: undefined };
  if (t === 'integer') return /^-?\d+$/.test(text) ? { ok: true, value: Number(text) } : { ok: false };
  if (t === 'number') return Number.isFinite(Number(text)) ? { ok: true, value: Number(text) } : { ok: false };
  if (t === 'boolean') {
    if (text === 'true') return { ok: true, value: true };
    if (text === 'false') return { ok: true, value: false };
    return { ok: false };
  }
  return { ok: true, value: text };
}

// Test-panel input text -> the value sent to bemain (which does the real
// coercion/validation — this only turns typed text into the right JSON shape).
export function testInputValue(v: ToolVariable, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: undefined };
  switch (v.data_type) {
    case 'integer':
    case 'number': {
      const n = Number(text);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `'${v.name}' must be a number.` };
    }
    case 'boolean':
      return { ok: true, value: text === 'true' };
    case 'list':
    case 'object':
    case 'json':
    case 'file_list': {
      if (v.data_type === 'file_list' && !text.startsWith('[')) return { ok: true, value: splitList(text) };
      try { return { ok: true, value: JSON.parse(text) }; }
      catch { return { ok: false, error: `'${v.name}' is not valid JSON.` }; }
    }
    default:
      return { ok: true, value: text };
  }
}

// bemain's /tools/validate issue → a short line for the editor.
export interface ValidationIssue { field: string; message: string; line?: number }

export function formatIssue(issue: ValidationIssue): string {
  if (issue.line == null) return issue.message;
  // `code` line 1 is the generated signature the author never edits.
  const line = issue.field === 'code' ? Math.max(1, issue.line - 1) : issue.line;
  return `line ${line}: ${issue.message}`;
}
