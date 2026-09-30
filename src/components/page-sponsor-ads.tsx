"use client";
import { useApp } from './app-provider';
import { SponsorCreative } from './sponsor-creative';
import type { SponsorPlacement } from '@/lib/types';

export function PageSponsorAds({ surface }: { surface: Exclude<SponsorPlacement['surface'], 'agenda' | undefined> }) {
  const { guide } = useApp();
  return <>{guide.placements.filter(placement => placement.published && placement.surface === surface).map(placement => {
    const sponsor = guide.sponsors.find(item => item.id === placement.sponsor_id && item.published);
    return sponsor ? <SponsorCreative key={`${placement.id}:${placement.image_url}`} placement={placement} sponsorName={sponsor.name} /> : null;
  })}</>;
}
