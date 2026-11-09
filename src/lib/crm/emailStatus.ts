// Labels and refresh limits for Resend delivery status.
// This module does not send mail, store bodies, or add a tracking pixel.

export const EMAIL_EVENTS = ['sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked'] as const;
export type EmailEvent = (typeof EMAIL_EVENTS)[number];

export const EMAIL_STATUS_CAP = 25;
export const EMAIL_STATUS_DAYS = 30;
export const EMAIL_REFRESH_WINDOW_MS = 30_000;

export function emailStatusLabel(event: string | null | undefined): 'Delivered' | 'Opened (approximate)' | 'Bounced' | 'Not yet reported' {
  if (event === 'delivered') return 'Delivered';
  if (event === 'opened' || event === 'clicked') return 'Opened (approximate)';
  if (event === 'bounced' || event === 'complained') return 'Bounced';
  return 'Not yet reported';
}

export function knownEmailEvent(value: string | null | undefined): EmailEvent | null {
  return (EMAIL_EVENTS as readonly string[]).includes(value ?? '') ? (value as EmailEvent) : null;
}

const refreshHits = new Map<string, number[]>();

export function emailRefreshLimited(key: string, nowMs: number): boolean {
  const fresh = (refreshHits.get(key) ?? []).filter((hit) => nowMs - hit < EMAIL_REFRESH_WINDOW_MS);
  if (fresh.length >= 1) {
    refreshHits.set(key, fresh);
    return true;
  }
  refreshHits.set(key, [...fresh, nowMs]);
  return false;
}

export function clearEmailRefreshRates(): void {
  refreshHits.clear();
}
