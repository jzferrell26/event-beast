"use client";

import Image from 'next/image';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { SponsorPlacement } from '@/lib/types';
import { httpsUrl } from '@/lib/format';

export function SponsorCreative({ placement, sponsorName, sponsorUrl, preview = false }: { placement: Pick<SponsorPlacement, 'image_url' | 'image_alt' | 'image_format' | 'link_url' | 'headline' | 'body'>; sponsorName: string; sponsorUrl?: string; preview?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const image = httpsUrl(placement.image_url);
  const target = !preview && (httpsUrl(placement.link_url) || httpsUrl(sponsorUrl));
  const square = placement.image_format === 'square';
  const content = <>{preview && <span className="sponsor-creative-label">Creative preview · {sponsorName}</span>}{image && !failed ? <div className="sponsor-creative-image" style={!square && naturalRatio ? { aspectRatio: naturalRatio } : undefined}><Image unoptimized src={image} alt={placement.image_alt || placement.headline || `${sponsorName} sponsor message`} fill sizes="(max-width: 600px) 90vw, 800px" onLoad={event => { const element = event.currentTarget; if (element.naturalWidth && element.naturalHeight) setNaturalRatio(element.naturalWidth / element.naturalHeight); }} onError={() => setFailed(true)} /></div> : <div className="sponsor-creative-fallback"><h3>{sponsorName}</h3>{placement.body && <p>{placement.body}</p>}{failed && <p>The sponsor image is unavailable right now.</p>}</div>}{(target || preview) && <span className="sponsor-creative-caption"><strong>Visit their website</strong><ArrowUpRight size={18} aria-hidden="true" /></span>}</>;
  const className = `sponsor-creative sponsor-creative-${square ? 'square' : 'banner'}${!square && naturalRatio && naturalRatio < 1 ? ' sponsor-creative-portrait' : ''}`;
  return target ? <a className={className} href={target} target="_blank" rel="noopener noreferrer sponsored" aria-label={`${sponsorName}: ${placement.headline || 'sponsor advertisement'} (opens in a new tab)`}>{content}</a> : <aside className={className} aria-label={`${sponsorName} advertisement${preview ? ' preview' : ''}`}>{content}</aside>;
}
