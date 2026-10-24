// components/account/format.ts
// Number and date formatting shared by the Account pages. Money is US dollars, and
// individual LLM calls cost fractions of a cent, so precision has to follow the size of
// the number or small spend shows as "$0.00".

/** A dollar amount as a plain number with enough decimals to be meaningful: 12.34, 0.042, 0.0042. */
export function fmtAmount(n: number): string {
  const abs = Math.abs(n);
  const max = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return n.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, max), maximumFractionDigits: max });
}

/** "$12.34" / "-$0.0042". */
export function fmtUsd(n: number): string {
  return `${n < 0 ? '-' : ''}$${fmtAmount(Math.abs(n))}`;
}

/** Axis ticks: only as many decimals as the tick step needs ($0, $0.5, $1 / $0.002, $0.004). */
export function fmtTick(value: number, step: number): string {
  if (value === 0) return '$0';
  const decimals = step >= 1 ? 0 : Math.min(4, Math.max(1, Math.ceil(-Math.log10(step))));
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** A price per million tokens: "$0.02", "$0.60", "$12.50". Keeps two significant decimals for very small rates. */
export function fmtRate(n: number): string {
  const decimals = n >= 1 ? 2 : n >= 0.1 ? 3 : 4;
  const fixed = n.toFixed(decimals);
  // Trim trailing zeros but never below two decimals ("0.0200" -> "0.02").
  return fixed.replace(/(\.\d\d)0+$/, '$1');
}

/** A token count in words: 1.67M, 50M, 2.5B, 800K. */
export function fmtTokens(n: number): string {
  const trim = (v: number) => {
    const fixed = v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
    return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  };
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}

export function fmtInr(n: number, fractionDigits = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/** 1,284 / 12.9K / 4.2M */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Whole days from now until `iso` (negative once it has passed). */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

export function initials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || text.slice(0, 2).toUpperCase();
}
