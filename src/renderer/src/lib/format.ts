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
