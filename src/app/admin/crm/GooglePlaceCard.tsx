'use client';

import { useEffect, useState } from 'react';
import { browserLink, freshPhotoSrc } from '@/lib/crm/placeLinks';

type Card = {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  hours: string[];
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  photoCredits: string[];
  photoUrl: string | null;
};

export function GooglePlaceCard({ accountId }: { accountId: string }) {
  const [state, setState] = useState<'loading' | 'not_connected' | 'no_match' | 'matched'>('loading');
  const [card, setCard] = useState<Card | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setPhotoSrc(null);
    fetch(`/api/admin/crm/places?brand=cedargrowth&accountId=${encodeURIComponent(accountId)}`, {
      headers: { 'x-cedargrowth-crm': '1' },
      credentials: 'same-origin',
    }).then((res) => res.json()).then((body: { state?: string; card?: Card }) => {
      if (cancel) return;
      if (body.state === 'matched' && body.card) {
        setCard(body.card);
        setPhotoSrc(body.card.photoUrl ? freshPhotoSrc(body.card.photoUrl, crypto.randomUUID()) : null);
        setState('matched');
        return;
      }
      setCard(null);
      setPhotoSrc(null);
      setState(body.state === 'not_connected' ? 'not_connected' : 'no_match');
    }).catch(() => { if (!cancel) { setPhotoSrc(null); setState('not_connected'); } });
    return () => { cancel = true; };
  }, [accountId]);

  const website = browserLink(card?.website);
  const mapsUrl = browserLink(card?.mapsUrl);

  return (
    <section className="flex w-full flex-col gap-3 border border-hairline bg-clinical p-3">
      <h3 className="font-display text-body-l text-primary">Google</h3>
      {state === 'loading' ? <p className="text-caption text-tertiary">Loading Google details.</p> : null}
      {state === 'not_connected' ? <p className="text-body-m text-secondary">not connected</p> : null}
      {state === 'no_match' ? <p className="text-body-m text-secondary">No Google match</p> : null}
      {state === 'matched' && card ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-m text-primary">{card.name}</p>
          <p className="font-mono text-specimen text-primary">{card.rating === null ? 'No rating' : `${card.rating} from ${card.reviewCount ?? 0} reviews`}</p>
          {card.hours.length ? <ul className="flex flex-col gap-1">{card.hours.map((line) => <li key={line} className="text-caption text-secondary">{line}</li>)}</ul> : <p className="text-caption text-tertiary">Hours not provided.</p>}
          <p className="text-body-m text-primary">{card.phone || 'No phone'}</p>
          {website ? <a href={website} className="min-h-[44px] text-body-m text-primary underline">Website</a> : <p className="text-caption text-tertiary">No website</p>}
          {photoSrc ? (
            // The photo is proxied by our server. The Google key never reaches the browser.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc} alt="" className="h-auto max-h-48 w-auto max-w-full self-start object-contain" />
          ) : null}
          {card.photoCredits.length ? <p className="text-caption text-tertiary">Photo: {card.photoCredits.join(', ')}</p> : null}
          {mapsUrl ? <a href={mapsUrl} className="inline-flex min-h-[44px] items-center text-body-m text-primary underline">View on Google Maps</a> : null}
          <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Data from Google</p>
        </div>
      ) : null}
    </section>
  );
}
