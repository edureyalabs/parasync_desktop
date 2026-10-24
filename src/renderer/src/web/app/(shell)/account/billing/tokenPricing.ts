// app/(shell)/account/billing/tokenPricing.ts
// What a token costs, as the Billing tab and the Add funds modal show it. The server resolves the active rate
// (/api/wallet/token-pricing) and returns dollars per million tokens only -- never which model the rate belongs to.

export interface TokenPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  /** What one code run costs once a plan's monthly allowance is used up (absent if it could not be loaded). */
  runPriceUsd?: number;
  /** False while runs past the allowance are counted but not yet charged. */
  runsCharged?: boolean;
}

/** Null when pricing could not be loaded; callers simply leave the pricing display out. */
export async function fetchTokenPricing(): Promise<TokenPricing | null> {
  try {
    const res = await fetch('/api/wallet/token-pricing');
    const data = await res.json();
    if (data?.ok && Number(data.inputPerMillionUsd) > 0 && Number(data.outputPerMillionUsd) > 0) {
      const run = Number(data.runPriceUsd);
      return {
        inputPerMillionUsd: Number(data.inputPerMillionUsd), outputPerMillionUsd: Number(data.outputPerMillionUsd),
        ...(run > 0 ? { runPriceUsd: run, runsCharged: data.runsCharged === true } : {}),
      };
    }
  } catch {
    // Pricing is informational; a failure must never get in the way of topping up.
  }
  return null;
}

/** How many tokens `usd` dollars buy at a rate quoted per million tokens. */
export function tokensForUsd(usd: number, perMillionUsd: number): number {
  return perMillionUsd > 0 ? (usd / perMillionUsd) * 1_000_000 : 0;
}
