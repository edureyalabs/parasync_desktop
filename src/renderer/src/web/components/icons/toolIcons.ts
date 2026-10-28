// components/icons/toolIcons.ts
import type { IconName } from './Icon';

// Which picture and colour a tool gets, wherever it is shown: the Platform Tools list, a chain node, a planner step. One table, so a tool looks the same
// in every place. Names are the tool names bemain uses (platform tools, the built-in workspace / memory / cron tools, delivery tools); anything not listed
// falls back by prefix (MCP servers get a plug) and then to a wrench, which is what a custom Tool Builder tool is.

export interface ToolIconSpec {
  name: IconName;
  color: string;
}

const SLATE = '#3D5A6E';
const TEAL = '#2F6F8F';
const BRASS = '#A17F3A';
const BRASS_DEEP = '#7C5F27';
const GREEN = '#3D7A4F';
const WHATSAPP = '#1FA855';
const VIOLET = '#5F4A8C';
const AMBER = '#B5651D';
const RED = '#B34A3C';
const STONE = '#67655A';

const EXACT: Record<string, ToolIconSpec> = {
  code_executor: { name: 'terminal', color: SLATE },
  browser_open_session: { name: 'globe', color: TEAL },
  browser_execute: { name: 'mouse-pointer-click', color: TEAL },
  browser_look: { name: 'scan-search', color: TEAL },
  browser_act: { name: 'mouse-pointer-click', color: TEAL },
  browser_close_session: { name: 'circle-x', color: TEAL },
  send_email: { name: 'mail', color: BRASS },
  whatsapp_chats: { name: 'whatsapp', color: WHATSAPP },
  whatsapp_read: { name: 'whatsapp', color: WHATSAPP },
  whatsapp_send: { name: 'whatsapp', color: WHATSAPP },
  submit_to_chat: { name: 'message-square', color: '#3F7A5C' },
  push_notification: { name: 'bell', color: AMBER },
  workspace_list: { name: 'folder-open', color: STONE },
  workspace_list_projects: { name: 'folder-search', color: STONE },
  workspace_read: { name: 'file-text', color: STONE },
  workspace_write: { name: 'file-pen', color: STONE },
  workspace_delete: { name: 'trash', color: STONE },
  workspace_delete_project: { name: 'trash', color: STONE },
  workspace_present_files: { name: 'eye', color: STONE },
  workspace_update_file_purpose: { name: 'notebook-pen', color: STONE },
  workspace_update_project_purpose: { name: 'folder-pen', color: STONE },
  remember: { name: 'bookmark', color: VIOLET },
  recall_memory: { name: 'brain', color: VIOLET },
  create_cron: { name: 'alarm-clock', color: AMBER },
  cancel_cron: { name: 'alarm-clock', color: RED },
  list_crons: { name: 'calendar-clock', color: AMBER },
};

export function toolIcon(toolName: string | null | undefined): ToolIconSpec {
  const name = (toolName ?? '').trim();
  if (EXACT[name]) return EXACT[name];
  if (name.startsWith('mcp__')) return { name: 'plug', color: VIOLET };
  if (name.startsWith('browser_')) return { name: 'globe', color: TEAL };
  if (name.startsWith('whatsapp_')) return { name: 'whatsapp', color: WHATSAPP };
  if (name.startsWith('workspace_')) return { name: 'folder-open', color: STONE };
  if (/excel|spreadsheet/.test(name)) return { name: 'file-spreadsheet', color: GREEN };
  if (/word|pdf|document/.test(name)) return { name: 'file-text', color: SLATE };
  if (/memory|memories/.test(name)) return { name: 'brain', color: VIOLET };
  if (/cron/.test(name)) return { name: 'alarm-clock', color: AMBER };
  return { name: 'wrench', color: BRASS_DEEP };
}

/** The tool's picture only when it is a tool we know by name (or an MCP tool); null for anything else, so a caller can keep its own generic picture. */
export function toolIconIfKnown(toolName: string | null | undefined): ToolIconSpec | null {
  const name = (toolName ?? '').trim();
  return EXACT[name] || name.startsWith('mcp__') ? toolIcon(name) : null;
}
