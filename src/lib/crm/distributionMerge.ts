// Move a dispensary account's contacts onto the won deal's account and keep the prior account id.

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

export function dispensaryContacts(contacts: readonly { id: string; accountId: string }[], accountId: string): ContactPrior[] {
  return contacts.filter((row) => row.accountId === accountId).map((row) => ({ contactId: row.id, priorAccountId: row.accountId }));
}

export function planDistributionMerge(input: {
  openMerge: MergeRow | null;
  opportunityId: string;
  accountId: string;
  actor: string;
  priors: ContactPrior[];
  now: string;
}): { action: 'skip' } | { action: 'insert'; row: Omit<MergeRow, 'id'>; assignments: { contactId: string; accountId: string }[] } {
  if (input.openMerge && input.openMerge.opportunityId === input.opportunityId && input.openMerge.undoneAt === null) {
    return { action: 'skip' };
  }
  const priors = input.priors.map((row) => ({ contactId: row.contactId, priorAccountId: row.priorAccountId }));
  return {
    action: 'insert',
    row: {
      opportunityId: input.opportunityId,
      accountId: input.accountId,
      actor: input.actor,
      contactIds: priors.map((row) => row.contactId),
      priors,
      createdAt: input.now,
      undoneAt: null,
      undoneBy: null,
    },
    assignments: priors.map((row) => ({ contactId: row.contactId, accountId: input.accountId })),
  };
}

export function undoAssignments(priors: readonly ContactPrior[]): { contactId: string; accountId: string }[] {
  return priors.map((row) => ({ contactId: row.contactId, accountId: row.priorAccountId }));
}

export function planUndoMerge(row: MergeRow, actor: string, now: string): MergeRow {
  return { ...row, contactIds: [...row.contactIds], undoneAt: now, undoneBy: actor };
}
