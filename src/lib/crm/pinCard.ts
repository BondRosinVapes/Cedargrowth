// Fields the map pin card is allowed to show. Notes, consent, and contact preference stay off this payload.

export type CardAccount = {
  id: string;
  displayName: string;
  licenseRef: string | null;
  accountType: string | null;
  ocmStatus: 'verified' | 'unverified' | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  county: string | null;
  status: string | null;
  assignedRep: string | null;
};

export function cardAccountFields(account: {
  id: string;
  displayName: string;
  licenseRef: string | null;
  accountType: string | null;
  ocmStatus?: 'verified' | 'unverified' | null;
  street?: string | null;
  city: string | null;
  postalCode?: string | null;
  county: string | null;
  status: string | null;
  assignedRep: string | null;
}): CardAccount {
  return {
    id: account.id,
    displayName: account.displayName,
    licenseRef: account.licenseRef,
    accountType: account.accountType,
    ocmStatus: account.ocmStatus === 'verified' || account.ocmStatus === 'unverified' ? account.ocmStatus : null,
    street: account.street ?? null,
    city: account.city,
    postalCode: account.postalCode ?? null,
    county: account.county,
    status: account.status,
    assignedRep: account.assignedRep,
  };
}

export type CardContact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export function cardContactFields(contact: {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
}): CardContact {
  return {
    id: contact.id,
    name: contact.name,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
  };
}

export function mailtoHref(email: string): string | null {
  const value = email.trim();
  if (!value) return null;
  return `mailto:${encodeURIComponent(value)}`;
}

export function telHref(phone: string): string | null {
  const value = phone.trim();
  if (!value || !/^[0-9+().\-\s]+$/.test(value) || !/\d/.test(value)) return null;
  return `tel:${value}`;
}
