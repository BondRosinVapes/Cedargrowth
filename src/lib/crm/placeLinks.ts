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

export function freshPhotoSrc(photoUrl: string, viewId: string): string | null {
  const id = viewId.trim();
  if (!photoUrl || !id) return null;
  const url = new URL(photoUrl, 'https://cedargrowth.vercel.app');
  url.searchParams.set('view', id);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function photoSrcForView(photoUrl: string | null, sells: boolean, viewId: string): string | null {
  if (!photoUrl) return null;
  if (sells) return photoUrl;
  return freshPhotoSrc(photoUrl, viewId);
}
