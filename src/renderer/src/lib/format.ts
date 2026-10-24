// src/renderer/src/lib/format.ts
// Number and date formatting, as in the web app (components/account/format.ts). Money is US dollars, and single
// model calls cost fractions of a cent, so precision follows the size of the number.

export function fmtAmount(n: number): string {
  const abs = Math.abs(n);
  const max = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return n.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max });
}

/** "$12.34" / "-$0.0042". */
export function fmtUsd(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmtAmount(Math.abs(n))}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function initials(text: string): string {
  return (
    text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || text.slice(0, 2).toUpperCase()
  );
}

/** 1,284 / 12.9K / 4.2M */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
