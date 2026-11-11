// Attach existing contacts to the account when a deal is won. Nothing is copied or deleted.

export type MergeRow = {
  id: string;
  opportunityId: string;
  accountId: string;
  actor: string;
  contactIds: string[];
  createdAt: string;
  undoneAt: string | null;
  undoneBy: string | null;
};

export function planDistributionMerge(input: {
  openMerge: MergeRow | null;
  opportunityId: string;
  accountId: string;
  actor: string;
  contactIds: string[];
  now: string;
}): { action: 'skip' } | { action: 'insert'; row: Omit<MergeRow, 'id'> } {
  if (input.openMerge && input.openMerge.opportunityId === input.opportunityId && input.openMerge.undoneAt === null) {
    return { action: 'skip' };
  }
  return {
    action: 'insert',
    row: {
      opportunityId: input.opportunityId,
      accountId: input.accountId,
      actor: input.actor,
      contactIds: [...input.contactIds],
      createdAt: input.now,
      undoneAt: null,
      undoneBy: null,
    },
  };
}

export function planUndoMerge(row: MergeRow, actor: string, now: string): MergeRow {
  return { ...row, contactIds: [...row.contactIds], undoneAt: now, undoneBy: actor };
}
