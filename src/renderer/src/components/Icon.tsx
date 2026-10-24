// src/renderer/src/components/Icon.tsx
import type { CSSProperties } from 'react';

export type IconName =
  | 'chat' | 'store' | 'mail' | 'user' | 'logout' | 'send' | 'search' | 'bell' | 'check' | 'external'
  | 'refresh' | 'tasks' | 'clock' | 'folder' | 'download' | 'close' | 'paperclip' | 'wallet' | 'building' | 'info' | 'alert';

const P: Record<IconName, string> = {
  chat: 'M3 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3.5v-3.5H5a2 2 0 0 1-2-2v-7Z',
  store: 'M3.5 8.5 4.7 4h11.6l1.2 4.5M3.5 8.5v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7M3.5 8.5h13.5M7 8.5v2a2.5 2.5 0 0 0 5 0v-2',
  mail: 'M3.5 5.5h14v10h-14v-10ZM3.5 5.5l7 5.5 7-5.5',
  user: 'M10.5 10.4a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM4 17c.9-3.2 3.6-5 6.5-5s5.6 1.8 6.5 5',
  logout: 'M8 3H4.5A1.5 1.5 0 0 0 3 4.5v10A1.5 1.5 0 0 0 4.5 16H8M12.5 13l4-4-4-4M16 9H7.5',
  send: 'M3 10 17 3l-4.5 14-2.8-5.6L3 10ZM9.7 11.4 17 3',
  search: 'M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM14 14l4 4',
  bell: 'M5 8a5 5 0 0 1 10 0c0 5 2 6 2 6H3s2-1 2-6ZM8.5 17a1.7 1.7 0 0 0 3 0',
  check: 'm4 10.5 4 4 8-9',
  external: 'M11 3h6v6M17 3l-8 8M14 11v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M16.5 9A6.5 6.5 0 0 0 5 5.5L3.5 7M3.5 3v4h4M3.5 11A6.5 6.5 0 0 0 15 14.5l1.5-1.5M16.5 17v-4h-4',
  tasks: 'M4 5.5 5.5 7 8 4.5M10.5 5.5H17M4 11.5 5.5 13 8 10.5M10.5 11.5H17M10.5 16H17',
  clock: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 6v4.5l3 1.5',
  folder: 'M3 6.5a1.5 1.5 0 0 1 1.5-1.5H8l1.5 2h6a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15V6.5Z',
  download: 'M10 3v10M6 9l4 4 4-4M4 16h12',
  close: 'm5 5 10 10M15 5 5 15',
  paperclip: 'm15 9-5.5 5.5a3 3 0 0 1-4.2-4.2l6-6a2 2 0 0 1 2.8 2.8l-6 6a1 1 0 0 1-1.4-1.4L12 6',
  wallet: 'M3.5 6.5a2 2 0 0 1 2-2H15v3M3.5 6.5v8a2 2 0 0 0 2 2h10.5v-9H5.5a2 2 0 0 1-2-2ZM13 11.5h1.5',
  building: 'M4 17V4.5h8V17M12 8.5h4V17M2.5 17h15M7 8h2M7 11h2M7 14h2',
  info: 'M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM10 9v4.5M10 6.5v.01',
  alert: 'M10 3 2.5 16h15L10 3ZM10 8v4M10 14v.01',
};

export function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.5, style }: { name: IconName; size?: number; color?: string; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, ...style }} aria-hidden="true">
      <path d={P[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** WhatsApp-style delivery ticks: one = sent, two = received, two blue = answered. */
export function DeliveryTicks({ double, color }: { double: boolean; color: string }) {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" aria-hidden="true">
      <path d="m1 6 3 3 6-7" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {double && <path d="m6 8.5.6.5 6-7" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
