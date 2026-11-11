import { getSupabaseServerClient } from '@/lib/supabase';
import { PLACE_PHOTO_BUCKET, placePhotoObjectPath, placePhotoPrefix } from './places';

const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function typeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return TYPE_BY_EXT[ext] || null;
}

export async function findStoredPlacePhoto(placeId: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const client = getSupabaseServerClient();
  const prefix = placePhotoPrefix(placeId);
  if (!client || !prefix) return null;
  const listed = await client.storage.from(PLACE_PHOTO_BUCKET).list(prefix, { limit: 20 });
  if (listed.error || !listed.data?.length) return null;
  const name = listed.data.map((file) => file.name).filter((file) => file && !file.endsWith('/')).sort()[0];
  if (!name) return null;
  const file = await client.storage.from(PLACE_PHOTO_BUCKET).download(`${prefix}/${name}`);
  if (file.error || !file.data) return null;
  const contentType = typeFromName(name);
  if (!contentType) return null;
  return { bytes: new Uint8Array(await file.data.arrayBuffer()), contentType };
}

export async function uploadStoredPlacePhoto(placeId: string, photoName: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  const client = getSupabaseServerClient();
  const path = placePhotoObjectPath(placeId, photoName, contentType);
  if (!path) return true;
  if (!client) return false;
  const { error } = await client.storage.from(PLACE_PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: true });
  return !error;
}

export async function removeStoredPlacePhotos(placeId: string): Promise<void> {
  const client = getSupabaseServerClient();
  const prefix = placePhotoPrefix(placeId);
  if (!client || !prefix) return;
  const listed = await client.storage.from(PLACE_PHOTO_BUCKET).list(prefix, { limit: 100 });
  if (listed.error || !listed.data?.length) return;
  const paths = listed.data.map((file) => file.name).filter((name) => name && !name.endsWith('/')).map((name) => `${prefix}/${name}`);
  if (!paths.length) return;
  await client.storage.from(PLACE_PHOTO_BUCKET).remove(paths);
}
