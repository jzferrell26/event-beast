"use client";
import Image from 'next/image';
import { ArrowUpRight, Handshake } from 'lucide-react';
import { httpsUrl } from '@/lib/format';
import { useApp } from './app-provider';
import { EmptyState, PageTitle } from './ui';

export function ImpactPartnersScreen() {
  const { guide } = useApp();
  const groups = [...[...guide.tiers].sort((a,b) => a.sort_order-b.sort_order).map(tier => ({id:tier.id,name:tier.name})),{id:null,name:'Event partners'}];
  return <>
    <PageTitle eyebrow="THE PARTNERS BEHIND THE MOMENTUM" title={guide.settings.sponsor_page_title || 'Impact Partners'} description={guide.settings.sponsor_page_description ?? 'Thank you to the partners making Momentum Builder LIVE possible.'} />
    {!guide.sponsors.length && <EmptyState title="Meet our partners soon." icon={<Handshake size={30} />}>The event team will publish the sponsor lineup here.</EmptyState>}
    {groups.map(group => {
      const sponsors = guide.sponsors.filter(sponsor => sponsor.tier_id === group.id).sort((a,b) => a.sort_order-b.sort_order || a.name.localeCompare(b.name));
      if (!sponsors.length) return null;
      return <section key={group.id ?? 'other'} className="sponsor-tier public-sponsor-tier">
        <h2 className="tier-heading"><span />{group.name}<span /></h2>
        <div className="public-sponsor-grid">{sponsors.map(sponsor => <article className="public-sponsor-logo-card" key={sponsor.id} aria-label={sponsor.name}>
          <div className="public-sponsor-logo">{httpsUrl(sponsor.logo_url) ? <Image src={sponsor.logo_url} alt={sponsor.name + ' logo'} fill sizes="(max-width: 600px) 44vw, (max-width: 1000px) 30vw, 260px" unoptimized /> : <span>{sponsor.name}</span>}</div>
          {sponsor.sponsorship_note && <p className="sponsorship-note">{sponsor.sponsorship_note}</p>}
          {httpsUrl(sponsor.cta_url) && <a href={sponsor.cta_url} target="_blank" rel="noopener noreferrer" className="partner-arrow icon-button" aria-label={'Visit ' + sponsor.name + ' website (opens in a new tab)'}><ArrowUpRight size={23} aria-hidden="true" /></a>}
          {sponsor.is_demo && <small>Sample sponsor</small>}
        </article>)}</div>
      </section>;
    })}
  </>;
}
