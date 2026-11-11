// Server adapter for the request hand-off. Table access stays inside the
// definer functions. This module does not log bodies or secrets.

import { getSupabaseServerClient } from '@/lib/supabase';
import { emptyHandoffBook, type AccountView, type HandoffDeps, type HandoffStatus, type SendLogRow } from './requestHandoff';

export function handoffDeps(): HandoffDeps {
  const book = emptyHandoffBook();
  const db = getSupabaseServerClient();
  return {
    book,
    async accountById(id: string) {
      const rows = await loadAccounts(id);
      return rows[0] || null;
    },
    async accounts() {
      return loadAccounts(null);
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

async function loadAccounts(id: string | null): Promise<AccountView[]> {
  const db = getSupabaseServerClient();
  if (!db) return [];
  let accounts = db.from('crm_accounts').select('id,brand,display_name,city,latitude,longitude,account_type,request_contact_email,bond_carried_skus,request_opt_out').eq('brand', 'cedargrowth');
  if (id) accounts = accounts.eq('id', id);
  const { data } = await accounts.limit(500);
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
