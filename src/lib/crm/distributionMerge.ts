// Move contacts from other CedarGrowth accounts that share a license onto the won account.

import { isDispensaryAccount } from './engine';

export type ContactPrior = { contactId: string; priorAccountId: string };

export type MergeRow = {
  id: string;
  opportunityId: string;
  accountId: string;
  actor: string;
  contactIds: string[];
  priors: ContactPrior[];
  createdAt: string;
  undoneAt: string | null;
  undoneBy: string | null;
};

export type LicenseAccount = {
  id: string;
  brand: 'cedargrowth' | 'bond';
  accountType: string | null;
  licenseRef: string | null;
};

export type LicenseContact = { id: string; brand: 'cedargrowth' | 'bond'; accountId: string };

export type LicenseWorld = {
  accounts: LicenseAccount[];
  contacts: LicenseContact[];
  merges: MergeRow[];
  notes: { id: string; accountId: string }[];
};

export function licenseKey(value: string | null | undefined): string | null {
  const key = (value ?? '').trim().toLowerCase();
  return key.length ? key : null;
}

export function applyWonMerge(world: LicenseWorld, input: {
  opportunityId: string;
  accountId: string;
  actor: string;
  now: string;
  stage: string;
}): { world: LicenseWorld; code: 'not_won' | 'skipped' | 'already' | 'merged' } {
  if (input.stage !== 'won') return { world, code: 'not_won' };
  const won = world.accounts.find((account) => account.id === input.accountId);
  if (!won || won.brand !== 'cedargrowth' || !isDispensaryAccount(won.accountType)) return { world, code: 'skipped' };
  if (world.merges.some((row) => row.opportunityId === input.opportunityId && row.undoneAt === null)) return { world, code: 'already' };
  const key = licenseKey(won.licenseRef);
  const matched = new Set(key
    ? world.accounts.filter((account) => account.brand === 'cedargrowth' && account.id !== won.id && licenseKey(account.licenseRef) === key).map((account) => account.id)
    : []);
  const moving = world.contacts.filter((contact) => contact.brand === 'cedargrowth' && matched.has(contact.accountId));
  const priors = moving.map((contact) => ({ contactId: contact.id, priorAccountId: contact.accountId }));
  const contacts = world.contacts.map((contact) => (priors.some((row) => row.contactId === contact.id) ? { ...contact, accountId: won.id } : contact));
  const merge: MergeRow = {
    id: `merge-${world.merges.length + 1}`,
    opportunityId: input.opportunityId,
    accountId: won.id,
    actor: input.actor,
    contactIds: priors.map((row) => row.contactId),
    priors,
    createdAt: input.now,
    undoneAt: null,
    undoneBy: null,
  };
  return { world: { ...world, contacts, merges: [...world.merges, merge] }, code: 'merged' };
}

export function undoWonMerge(world: LicenseWorld, mergeId: string, actor: string, now: string): { world: LicenseWorld; refused: string[] } {
  const merge = world.merges.find((row) => row.id === mergeId && row.undoneAt === null);
  if (!merge) return { world, refused: [] };
  const refused: string[] = [];
  const contacts = world.contacts.map((contact) => {
    const prior = merge.priors.find((row) => row.contactId === contact.id);
    if (!prior) return contact;
    const account = world.accounts.find((row) => row.id === prior.priorAccountId);
    if (!account || account.brand !== 'cedargrowth' || account.brand !== contact.brand) {
      refused.push(contact.id);
      return contact;
    }
    return { ...contact, accountId: prior.priorAccountId };
  });
  const merges = world.merges.map((row) => (row.id === merge.id ? { ...row, undoneAt: now, undoneBy: actor } : row));
  return { world: { ...world, contacts, merges }, refused };
}
