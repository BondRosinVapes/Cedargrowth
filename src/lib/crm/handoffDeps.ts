// Server adapter for the request hand-off. Table access stays inside the
// definer functions. This module does not log bodies or secrets.

import { getSupabaseServerClient } from '@/lib/supabase';
import { emptyHandoffBook, SHARE_CONSENT_VERSION, STORE_LIST_KEYS, type AccountView, type HandoffDeps, type HandoffRow, type HandoffStatus, type SendLogRow, type VisitPreference } from './requestHandoff';

type HandoffDb = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => { limit: (count: number) => PromiseLike<{ data: unknown[] | null }> };
        limit: (count: number) => PromiseLike<{ data: unknown[] | null }>;
      };
    };
  };
};

export function handoffDeps(db: HandoffDb | null = getSupabaseServerClient() as HandoffDb | null): HandoffDeps {
  const book = emptyHandoffBook();
  return {
    book,
    async accountById(id: string) {
      const rows = await loadAccounts(db, id);
      return rows[0] || null;
    },
    async accounts() {
      return loadAccounts(db, null);
    },
    async remotePurgeScheduled() {
      if (!db) return false;
      const { data } = await db.rpc('crm_bond_request_purge_scheduled');
      return data === true;
    },
    async remoteReceive(payload: unknown) {
      if (!db) return { result: 'rejected:schema' };
      const { data } = await db.rpc('crm_receive_bond_request_handoff', { p_payload: payload });
      const row = data as { result?: string; status?: HandoffStatus } | null;
      return { result: row?.result || 'rejected:schema', status: row?.status };
    },
    async remoteStatus(id: string) {
      if (!db) return null;
      const { data } = await db.rpc('crm_bond_request_handoff_status', { p_handoff_id: id });
      const row = data as { status?: HandoffStatus | null } | null;
      return row?.status || null;
    },
    async remoteErase(id: string) {
      if (!db) return { status: null, withdrawal: false };
      const { data } = await db.rpc('crm_erase_bond_request_handoff', { p_handoff_id: id });
      const row = data as { status?: HandoffStatus | null; withdrawal?: boolean } | null;
      return { status: row?.status || null, withdrawal: row?.withdrawal === true };
    },
    async remoteRow(id: string) {
      if (!db) return null;
      const { data } = await db.rpc('crm_bond_request_handoff_row', { p_handoff_id: id });
      return handoffRowFromRecord(data);
    },
    async remoteStores(sku: string) {
      if (!db) return [];
      const { data } = await db.rpc('crm_bond_request_store_list', { p_sku: sku });
      if (!Array.isArray(data)) return [];
      return data.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const record = row as Record<string, unknown>;
        if (typeof record.id !== 'string' || typeof record.display_name !== 'string') return [];
        const mapped = {
          id: record.id,
          display_name: record.display_name,
          city: record.city == null ? null : String(record.city),
          latitude: record.latitude == null ? null : Number(record.latitude),
          longitude: record.longitude == null ? null : Number(record.longitude),
        };
        const keys = Object.keys(mapped).sort().join(',');
        return keys === [...STORE_LIST_KEYS].sort().join(',') ? [mapped] : [];
      });
    },
    async remoteMark(id: string, status: HandoffStatus, send: Omit<SendLogRow, 'handoffId'> | null) {
      if (!db) return;
      await db.rpc('crm_mark_bond_request_handoff', {
        p_handoff_id: id,
        p_status: status,
        p_template: send?.template || null,
        p_template_version: send?.templateVersion || null,
        p_rendered_sha256: send?.renderedSha256 || null,
        p_provider_message_id: send?.providerMessageId || null,
      });
    },
  };
}

function handoffRowFromRecord(data: unknown): HandoffRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.handoff_id !== 'string' || typeof row.dispensary_account_id !== 'string') return null;
  const visit = row.visit_preference;
  const visitPreference: VisitPreference | null = visit === 'today' || visit === 'tomorrow' || visit === 'this_week' ? visit : null;
  const items = Array.isArray(row.items)
    ? row.items.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as { sku?: unknown; qty?: unknown };
      return typeof record.sku === 'string' && typeof record.qty === 'number' ? [{ sku: record.sku, qty: record.qty }] : [];
    })
    : [];
  return {
    handoffId: row.handoff_id,
    bondRequestId: null,
    receivedAt: String(row.received_at || ''),
    submittedAt: String(row.submitted_at || ''),
    dispensaryAccountId: row.dispensary_account_id,
    items,
    memberFirstName: null,
    memberContact: null,
    contactKind: null,
    visitPreference,
    shareConsentVersion: SHARE_CONSENT_VERSION,
    source: 'bond-haus',
    sourceEvent: typeof row.source_event === 'string' ? row.source_event : null,
    status: (typeof row.status === 'string' ? row.status : 'erased') as HandoffStatus,
    eraseRequestedAt: null,
    erasedAt: null,
    consumerClearedAt: String(row.received_at || ''),
  };
}

async function loadAccounts(db: HandoffDb | null, id: string | null): Promise<AccountView[]> {
  if (!db) return [];
  const accounts = db.from('crm_accounts').select('id,brand,display_name,city,latitude,longitude,account_type,request_contact_email,bond_carried_skus,request_opt_out').eq('brand', 'cedargrowth');
  const { data } = id ? await accounts.eq('id', id).limit(500) : await accounts.limit(500);
  const contacts = await db.from('crm_contacts').select('account_id,preference').eq('preference', 'do_not_contact').limit(500);
  const blocked = new Set((contacts.data || []).map((row) => String((row as { account_id: string }).account_id)));
  return ((data || []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    brand: 'cedargrowth',
    displayName: String(row.display_name || ''),
    city: row.city ? String(row.city) : null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    accountType: row.account_type ? String(row.account_type) : null,
    requestContactEmail: row.request_contact_email ? String(row.request_contact_email) : null,
    carriedSkus: Array.isArray(row.bond_carried_skus) ? row.bond_carried_skus.map(String) : [],
    requestOptOut: row.request_opt_out === true,
    doNotContact: blocked.has(String(row.id)),
  }));
}
