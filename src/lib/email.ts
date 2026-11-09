import { Resend } from 'resend';

export type ReservationItem = {
  slug: string;
  name: string;
  spec: string;
  qty: number;
};

export type ReservationEmailData = {
  name: string;
  email: string;
  location: string;
  note: string;
  items: ReservationItem[];
  itemCount: number;
};

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemsTable(items: ReservationItem[]): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.spec)}</td><td>${i.qty}</td></tr>`,
    )
    .join('');
  return `<table cellpadding="6" style="border-collapse:collapse"><thead><tr><th align="left">Product</th><th align="left">Spec</th><th align="left">Qty</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Internal alert to the CedarGrowth inbox. Skips cleanly if env is missing.
export async function sendReservationAlert(data: ReservationEmailData): Promise<void> {
  const resend = getResend();
  const to = process.env.RESERVATION_ALERT_TO;
  const from = process.env.RESERVATION_ALERT_FROM;
  if (!resend || !to || !from) {
    console.warn('Reservation alert skipped, email env not configured');
    return;
  }
  try {
    await resend.emails.send({
      from,
      to,
      subject: `New reservation request, ${data.name}`,
      html:
        `<p>New reservation request.</p>` +
        `<p>Name: ${escapeHtml(data.name)}<br>` +
        `Email: ${escapeHtml(data.email)}<br>` +
        `Location: ${escapeHtml(data.location)}<br>` +
        `Items reserved: ${data.itemCount}</p>` +
        (data.note ? `<p>Note: ${escapeHtml(data.note)}</p>` : '') +
        itemsTable(data.items),
    });
  } catch (err) {
    console.error('Reservation alert email failed', err);
  }
}

// Confirmation to the customer. House voice, no compound names, no payment claim.
export async function sendCustomerConfirmation(data: ReservationEmailData): Promise<void> {
  const resend = getResend();
  const from = process.env.RESERVATION_ALERT_FROM;
  if (!resend || !from) {
    console.warn('Customer confirmation skipped, email env not configured');
    return;
  }
  try {
    await resend.emails.send({
      from,
      to: data.email,
      subject: 'Your CedarGrowth reservation request',
      html:
        `<p>Thank you, ${escapeHtml(data.name)}.</p>` +
        `<p>We received your reservation request. This is a request, not a sale. ` +
        `A CedarGrowth coordinator confirms availability and routes it to the nearest ` +
        `dispensary that carries CedarGrowth. No payment was taken.</p>` +
        itemsTable(data.items),
    });
  } catch (err) {
    console.error('Customer confirmation email failed', err);
  }
}

export type SignupIntent = 'newsletter' | 'dna_kit' | 'find_dispensary' | 'wholesale';

export type SignupEmailData = {
  intent: SignupIntent;
  email: string;
  name: string | null;
  location: string | null;
  business: string | null;
  note: string | null;
};

const SIGNUP_INTENT_LABEL: Record<SignupIntent, string> = {
  newsletter: 'Newsletter signup',
  dna_kit: 'DNA kit interest',
  find_dispensary: 'Find a dispensary request',
  wholesale: 'Wholesale account request',
};

// Internal alert to the CedarGrowth inbox for a capture-form submission.
// Reuses the reservation alert env so no new env vars are introduced.
export async function sendSignupAlert(data: SignupEmailData): Promise<void> {
  const resend = getResend();
  const to = process.env.RESERVATION_ALERT_TO;
  const from = process.env.RESERVATION_ALERT_FROM;
  if (!resend || !to || !from) {
    console.warn('Signup alert skipped, email env not configured');
    return;
  }
  try {
    await resend.emails.send({
      from,
      to,
      subject: `${SIGNUP_INTENT_LABEL[data.intent]}, ${data.email}`,
      html:
        `<p>New ${escapeHtml(SIGNUP_INTENT_LABEL[data.intent]).toLowerCase()}.</p>` +
        `<p>Email: ${escapeHtml(data.email)}<br>` +
        (data.name ? `Name: ${escapeHtml(data.name)}<br>` : '') +
        (data.location ? `Location: ${escapeHtml(data.location)}<br>` : '') +
        (data.business ? `Business: ${escapeHtml(data.business)}<br>` : '') +
        `Source: ${escapeHtml(data.intent)}</p>` +
        (data.note ? `<p>Note: ${escapeHtml(data.note)}</p>` : ''),
    });
  } catch (err) {
    console.error('Signup alert email failed', err);
  }
}

export async function sendDigestEmail(data: { to: string[]; from: string; subject: string; html: string; text: string }): Promise<boolean> {
  const resend = getResend();
  const recipients = [...new Set(data.to.map((item) => item.trim()).filter(Boolean))];
  if (!resend || !data.from || recipients.length === 0) return false;
  try {
    await resend.emails.send({
      from: data.from,
      to: recipients,
      subject: data.subject,
      html: data.html,
      text: data.text,
    });
    return true;
  } catch (err) {
    console.error('Weekly digest email failed', err);
    return false;
  }
}

export async function sendReorderLink(data: { to: string; accountName: string; url: string }): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESERVATION_ALERT_FROM;
  if (!resend || !from || !data.to) return false;
  try {
    await resend.emails.send({
      from,
      to: data.to,
      subject: `CedarGrowth reorder link, ${data.accountName}`,
      html:
        `<p>A reorder link for ${escapeHtml(data.accountName)}.</p>` +
        `<p><a href="${escapeHtml(data.url)}">${escapeHtml(data.url)}</a></p>` +
        `<p>This link opens a request. It is not an order and no payment is taken.</p>`,
    });
    return true;
  } catch (err) {
    console.error('Reorder link email failed', err);
    return false;
  }
}

export async function sendReorderRequest(data: {
  to: string[];
  accountName: string;
  buyerName: string;
  buyerEmail: string;
  lines: { name: string; batchNumber: string; quantityUnits: number }[];
}): Promise<boolean> {
  const resend = getResend();
  const from = process.env.RESERVATION_ALERT_FROM;
  const recipients = [...new Set(data.to.map((item) => item.trim()).filter(Boolean))];
  if (!resend || !from || recipients.length === 0) return false;
  const rows = data.lines
    .map((line) => `<tr><td>${escapeHtml(line.name)}</td><td>${escapeHtml(line.batchNumber)}</td><td>${line.quantityUnits}</td></tr>`)
    .join('');
  try {
    await resend.emails.send({
      from,
      to: recipients,
      subject: `Reorder request, ${data.accountName}`,
      html:
        `<p>Reorder request for ${escapeHtml(data.accountName)}.</p>` +
        `<p>Buyer: ${escapeHtml(data.buyerName)}<br>Email: ${escapeHtml(data.buyerEmail)}</p>` +
        `<table cellpadding="6" style="border-collapse:collapse"><thead><tr><th align="left">Product</th><th align="left">Batch</th><th align="left">Units</th></tr></thead><tbody>${rows}</tbody></table>` +
        `<p>This is a request. No price is committed and no payment was taken. Place the order through the distributor.</p>`,
    });
    return true;
  } catch (err) {
    console.error('Reorder request email failed', err);
    return false;
  }
}

// Confirmation to the submitter. House voice, no compound names, no medical
// claims, no payment claim, no exclamation marks. States plainly what the
// address is used for.
export async function sendSignupConfirmation(data: SignupEmailData): Promise<void> {
  const resend = getResend();
  const from = process.env.RESERVATION_ALERT_FROM;
  if (!resend || !from) {
    console.warn('Signup confirmation skipped, email env not configured');
    return;
  }
  const body: Record<SignupIntent, string> = {
    newsletter:
      'We received your request to join the CedarGrowth newsletter. Your address is used ' +
      'only to send CedarGrowth updates, and is kept only for that purpose until you unsubscribe.',
    dna_kit:
      'We received your interest in the CedarGrowth DNA kit. Your address is used only to ' +
      'notify you when the kit is available, and is kept only for that purpose.',
    find_dispensary:
      'We received your request to find a dispensary that carries CedarGrowth. Your address ' +
      'is used only to send you the result of that search, and is kept only for that purpose.',
    wholesale:
      'We received your wholesale account request. A CedarGrowth coordinator reviews the ' +
      'request and follows up at this address. Your address is kept only for that purpose.',
  };
  try {
    await resend.emails.send({
      from,
      to: data.email,
      subject: 'Your CedarGrowth request',
      html: `<p>Thank you.</p><p>${body[data.intent]}</p>`,
    });
  } catch (err) {
    console.error('Signup confirmation email failed', err);
  }
}
