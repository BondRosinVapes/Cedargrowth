// A card link is rendered only when it is an http or https URL.

export function browserLink(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.toString();
}

export function stablePhotoUrl(accountId: string, photoName: string): string | null {
  const account = accountId.trim();
  const photo = photoName.trim();
  if (!account || !photo || photo.includes('..') || /[\s?#]/.test(photo)) return null;
  const params = new URLSearchParams();
  params.set('brand', 'cedargrowth');
  params.set('accountId', account);
  params.set('photo', photo);
  return `/api/admin/crm/places/photo?${params.toString()}`;
}
