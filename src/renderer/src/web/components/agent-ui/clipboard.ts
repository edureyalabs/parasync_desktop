// components/agent-ui/clipboard.ts
/** Copies text; false when the browser refuses (insecure context, permissions), so callers can say so instead of pretending. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
