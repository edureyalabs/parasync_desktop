// app/(shell)/account/billing/purchases.ts
// Turning raw wallet top-ups + invoices into the purchase history shown on the Billing tab.
// A top-up writes two rows with the same order id as `reference_id`: the wallet credit
// (what was added to the balance) and an invoice (what was paid, in the buyer's currency, and its number).

export interface TopUpRow {
  id: string;
  amount: number | string;
  reference_id: string | null;
  created_at: string;
}

export interface InvoiceRow {
  invoice_number: string;
  amount: number | string;
  currency: string;
  reference_id: string | null;
}

export interface Purchase {
  id: string;
  at: string;
  amount: number;
  invoiceNumber: string | null;
  paid: { amount: number; currency: string } | null;
}

export interface MonthGroup {
  key: string;        // "2026-10", the buyer's local month
  label: string;      // "October 2026"
  amount: number;
  items: Purchase[];
}

export function buildPurchases(topUps: TopUpRow[], invoices: InvoiceRow[]): Purchase[] {
  const invoiceByOrder = new Map<string, InvoiceRow>();
  for (const inv of invoices) if (inv.reference_id) invoiceByOrder.set(inv.reference_id, inv);

  return topUps
    .map(row => {
      const invoice = row.reference_id ? invoiceByOrder.get(row.reference_id) : undefined;
      return {
        id: row.id,
        at: row.created_at,
        amount: Number(row.amount),
        invoiceNumber: invoice?.invoice_number ?? null,
        paid: invoice ? { amount: Number(invoice.amount), currency: invoice.currency } : null,
      };
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function monthKeyLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Newest month first, newest purchase first inside each. */
export function groupByMonth(purchases: Purchase[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const p of purchases) {
    const key = monthKeyLocal(p.at);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: new Date(p.at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), amount: 0, items: [] };
      groups.set(key, group);
    }
    group.amount += p.amount;
    group.items.push(p);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function totalAdded(purchases: Purchase[]): number {
  return purchases.reduce((sum, p) => sum + p.amount, 0);
}
