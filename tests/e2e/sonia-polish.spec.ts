import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoGuide, demoMe } from '../../src/lib/demo';
import { publicSiteGuide } from '../../src/lib/public-site';
import { adminDefaults, adminResources } from '../../src/lib/admin-resources';

test.use({serviceWorkers:'block'});
const mapUrl='https://assets.hyatt.com/content/dam/hyatt/hyattdam/documents/2020/01/02/1234/Hyatt-Regency-Dallas-Floor-Plan-English.pdf';
function fixtureGuide(withLunch=false){
  const guide=publicSiteGuide(structuredClone(demoGuide),true);
  guide.settings={...guide.settings,sponsor_page_title:'Impact Partners',sponsor_page_description:'The partners making this event possible.',wifi_network:'Test-Meeting',wifi_password:'Test2026',support_email:'support@example.test',support_sms:'747-213-2155',venue_floor_plan_url:mapUrl};
  guide.days=[0,1,2].map(i=>({...demoGuide.days[0],id:`40000000-0000-4000-8000-00000000000${i+1}`,date:`2026-10-0${6+i}`,label:`Day ${i+1}`}));
  guide.sessions=[0,1,2].map(i=>({...demoGuide.sessions[0],id:`50000000-0000-4000-8000-00000000000${i+1}`,day_id:guide.days[i].id,title:'Networking session '+(i+1),description:'Bring **your questions** and <img src=x onerror=alert(1)>',starts_at:`2026-10-0${6+i}T15:00:00Z`,ends_at:`2026-10-0${6+i}T16:00:00Z`}));
  if(withLunch){
    guide.sessions.push({...demoGuide.sessions[0],id:'50000000-0000-4000-8000-000000000010',day_id:guide.days[1].id,title:'Lunch Break',description:'See lunch options.',starts_at:'2026-10-07T17:30:00Z',ends_at:'2026-10-07T18:30:00Z'});
    guide.lunches=[{...demoGuide.lunches[0],id:'80000000-0000-4000-8000-000000000001',event_date:'2026-10-07',published:true,is_demo:false}];
  }
  guide.sessionSpeakers=guide.sessions.map(session=>({event_id:guide.event.id,session_id:session.id,speaker_id:guide.speakers[0].id}));
  guide.sponsors=[{...demoGuide.sponsors[0],id:'60000000-0000-4000-8000-000000000099',name:'Test Impact Partner',logo_url:'https://assets.example/partner.png',cta_url:'https://partner.example/',sponsorship_note:'Kickoff Party'}];
  guide.placements=[{...demoGuide.placements[0],sponsor_id:guide.sponsors[0].id,day_id:null,after_session_id:null,surface:'lunch',image_url:'https://assets.example/creative.png',image_alt:'Approved test creative',image_format:'banner',link_url:'',published:true}];
  return guide;
}
async function wire(page:Page,withLunch=false){
  const guide=fixtureGuide(withLunch);
  await page.route('https://assets.example/**',route=>route.fulfill({path:'public/icons/momentum-mark-192.png',contentType:'image/png'}));
  await page.route('**/api/guide',route=>route.fulfill({json:guide}));
  return guide;
}
async function settle(page:Page){
  await page.waitForLoadState('networkidle');
  await expect.poll(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));return page.locator('.topbar:visible').count();}).toBe(1);
}

test('agenda searches all three days, shows dates and restores chosen-day navigation',async({page})=>{
  await wire(page);await page.goto('/agenda');await settle(page);
  await expect(page.getByRole('tab',{name:/Day 3/})).toBeVisible();
  await page.getByRole('tab',{name:/Day 1/}).click();await expect(page.locator('.session-title:visible')).toHaveCount(1);
  await page.getByRole('textbox',{name:'Search sessions'}).fill('networking');
  await expect(page.locator('.session-title:visible')).toHaveCount(3);
  await expect(page.locator('.session-date:visible')).toHaveText(['Tue, Oct 6','Wed, Oct 7','Thu, Oct 8']);
  await expect(page.locator('.type-pill:visible')).toHaveCount(0);
  await page.getByRole('tab',{name:/Day 2/}).click();await expect(page.getByRole('textbox',{name:'Search sessions'})).toHaveValue('');
  await expect(page.getByRole('heading',{name:'Networking session 2'})).toBeVisible();await expect(page.locator('.session-title:visible')).toHaveCount(1);
});

test('Sonia agenda regression: browser back, detail back and reload retain the selected day',async({page},info)=>{
  const guide=await wire(page);await page.goto('/agenda');await settle(page);
  const day2=page.getByRole('tab',{name:/Day 2/});
  await day2.click();
  await page.getByRole('link',{name:'Networking session 2',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Networking session 2'})).toBeVisible();
  await page.goBack();
  await expect(day2).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('link',{name:'Networking session 2',exact:true})).toBeVisible();
  await page.reload();await settle(page);
  await expect(day2).toHaveAttribute('aria-selected','true');
  await page.getByRole('link',{name:'Networking session 2',exact:true}).click();
  await page.getByRole('link',{name:'Back to agenda',exact:true}).click();
  await expect(day2).toHaveAttribute('aria-selected','true');
  await expect(page).toHaveURL(new RegExp(`/agenda\\?day=${guide.days[1].id}`));
  await expect(page.locator(`#agenda-session-${guide.sessions[1].id}`)).toBeInViewport();
  await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
  await page.screenshot({path:info.outputPath('agenda-day-2-restored.png')});
  // A cold session link has no previous list state; use the session's own day.
  await page.goto('/agenda/'+guide.sessions[2].id);await settle(page);
  await page.getByRole('link',{name:'Back to agenda',exact:true}).click();
  await expect(page.getByRole('tab',{name:/Day 3/})).toHaveAttribute('aria-selected','true');
});

test('Sonia agenda regression: keyboard day choice survives lunch navigation and invalid days are safe',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  await wire(page,true);await page.goto('/agenda?day=not-an-event-day');await settle(page);
  await expect(page.getByRole('tab',{name:/Day 1/})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:/Day 1/}).focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:/Day 2/})).toHaveAttribute('aria-selected','true');
  await page.getByRole('link',{name:'Lunch Break',exact:true}).click();
  await expect(page.locator('#lunch-2026-10-07')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab',{name:/Day 2/})).toHaveAttribute('aria-selected','true');
});

test('Lunch Break links to the matching date on the Lunch page',async({page})=>{
  await wire(page,true);await page.goto('/agenda');await settle(page);
  await page.getByRole('tab',{name:/Day 2/}).click();
  const lunch=page.locator('.session-card',{hasText:'Lunch Break'});
  await expect(lunch.getByRole('link',{name:'Lunch Break',exact:true})).toHaveAttribute('href','/more/lunch#lunch-2026-10-07');
  await expect(lunch.getByRole('link',{name:'View lunch options'})).toHaveAttribute('href','/more/lunch#lunch-2026-10-07');
  await lunch.getByRole('link',{name:'Lunch Break',exact:true}).click();
  await expect(page).toHaveURL(/\/more\/lunch#lunch-2026-10-07$/);
  await expect(page.locator('#lunch-2026-10-07')).toBeVisible();
});

test('a session with no description omits the In this session placeholder entirely',async({page})=>{
  const guide=fixtureGuide();guide.sessions[0].description='   ';
  await page.route('https://assets.example/**',route=>route.fulfill({path:'public/icons/momentum-mark-192.png',contentType:'image/png'}));
  await page.route('**/api/guide',route=>route.fulfill({json:guide}));
  await page.goto('/agenda/'+guide.sessions[0].id);await settle(page);
  await expect(page.getByRole('heading',{name:'In this session'})).toHaveCount(0);
  await expect(page.getByText('Session details will be added by the event team.')).toHaveCount(0);
});

test('speaker sessions include dates and descriptions render only safe bold text',async({page},info)=>{
  const guide=await wire(page);await page.goto('/more/speakers/'+guide.speakers[0].id);await settle(page);
  await expect(page.locator('.session-date:visible')).toHaveCount(3);
  await page.getByRole('link',{name:'Networking session 3',exact:true}).click();
  await expect(page.locator('.description-text:visible strong')).toHaveText('your questions');
  await expect(page.locator('.description-text:visible img')).toHaveCount(0);
  await expect(page.locator('.description-text:visible')).toContainText('<img src=x onerror=alert(1)>');
  await page.screenshot({path:info.outputPath('session-description.png'),fullPage:true});
});

test('Impact Partners has logo-only accessible arrows and regular sponsorship captions',async({page},info)=>{
  await wire(page);await page.goto('/sponsors');await settle(page);
  await expect(page.getByRole('heading',{level:1,name:'Impact Partners'})).toBeVisible();
  const card=page.locator('.public-sponsor-logo-card:visible');await expect(card).toHaveCount(1);
  await expect(card.locator('h3')).toHaveCount(0);await expect(card.getByText('Visit website',{exact:true})).toHaveCount(0);
  await expect(card.getByRole('link',{name:'Visit Test Impact Partner website (opens in a new tab)'})).toHaveAttribute('href','https://partner.example/');
  expect(await card.locator('.sponsorship-note').evaluate(element=>getComputedStyle(element).fontWeight)).toBe('400');
  await expect(page.locator('.bottom-nav:visible .lucide-handshake, .desktop-sidebar:visible .lucide-handshake')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('impact-partners.png'),fullPage:true});
  expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
});

test('Sonia consolidated home layout uses eight matching shortcuts and the revised mobile navigation',async({page},info)=>{
  await wire(page);await page.goto('/');await settle(page);
  const links=page.locator('.public-home .quick-links>a');await expect(links).toHaveCount(8);
  await expect(links.locator('strong')).toHaveText(['Full agenda','Saved sessions','Impact Partners','Our Speakers','Venue & help','Social wall','Lunch','Fun Stuff']);
  await expect(page.locator('.public-home .hub-welcome')).toHaveCount(0);
  await expect(page.locator('.public-home .home-grid')).toHaveCount(0);
  await expect(page.locator('.public-home .mobile-day-shortcuts')).toHaveCount(0);
  await expect(page.locator('.hero-bottom svg')).toHaveCount(0);
  if(info.project.name!=='public-desktop'){const nav=page.getByRole('navigation',{name:'Mobile navigation'});await expect(nav.getByRole('link')).toHaveText(['Home','Agenda','Feed','Partners','Fun Stuff','More']);}
  await page.screenshot({path:info.outputPath('sonia-home-polish.png'),fullPage:true});
});

test('Sonia consolidated Help owns venue details and the old Venue route redirects',async({page})=>{
  const guide=await wire(page);guide.venues=[{...guide.venues[0],id:'90000000-0000-4000-8000-000000000001',title:'Hyatt Regency Dallas',location:'300 Reunion Boulevard, Dallas, Texas 75207',description:'Event venue.',directions_url:'https://maps.example/dallas'}];
  await page.route('**/api/guide',route=>route.fulfill({json:guide}));
  await page.goto('/more/help');await settle(page);
  await expect(page.getByRole('heading',{name:'Hyatt Regency Dallas'})).toBeVisible();
  await expect(page.getByRole('link',{name:/floor plan/})).toHaveAttribute('href',mapUrl);
  await expect(page.getByRole('heading',{name:'Start with the agenda.'})).toHaveCount(0);
  await page.goto('/more/venue');await expect(page).toHaveURL(/\/more\/help$/);
});

test('Sonia consolidated More removes duplicate venue/admin rows and uses a distinct private-message icon',async({page})=>{
  await wire(page);await page.goto('/more');await settle(page);
  await expect(page.getByRole('heading',{name:'Find your way'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Help, Venue, and More'})).toBeVisible();
  await expect(page.getByText('Find your way, save this site, etc.')).toBeVisible();
  await expect(page.getByText('Organizer console',{exact:true})).toHaveCount(0);
  const privateRow=page.locator('.more-menu a',{hasText:'Private messages'});await expect(privateRow.locator('.lucide-message-circle')).toHaveCount(1);
});

test('Sonia final More order keeps profile and private messages available in the signed-in header', async ({page},info) => {
  await wire(page);
  await page.route('**/api/me', route => route.fulfill({json:{...demoMe,authenticated:true,eligible:true}}));
  await page.goto('/more');await settle(page);
  await expect(page.locator('.more-menu h2')).toHaveText(['Meet attendees','Private messages','Social wall','Impact Partners','Full agenda','Saved sessions','Meet the speakers','Lunch & breakouts','Fun Stuff','Help, Venue, and More']);
  await expect(page.locator('.more-menu a[href="/more/profile"]')).toHaveCount(0);
  await expect(page.locator('.topbar .profile-shortcut')).toHaveAttribute('href','/more/profile');
  await expect(page.locator('.topbar .message-shortcut')).toHaveAttribute('href','/inbox');
  await page.screenshot({path:info.outputPath('final-more.png'),fullPage:true});
});

test('Sonia final Help uses consistent display headings, red icons and equal contact typography', async ({page},info) => {
  const guide=await wire(page);
  guide.venues=[{...guide.venues[0],title:'Hyatt Regency Dallas',description:'Our main ballroom is on the lobby level, you can’t miss it!'}];
  await page.goto('/more/help');await settle(page);
  await expect(page.getByText(guide.venues[0].description,{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Keep this site handy.',exact:true})).toBeVisible();
  const grid=page.locator('.public-help-grid');
  const headings=await grid.locator(':scope > section > h2').evaluateAll(elements=>elements.map(element=>{
    const s=getComputedStyle(element);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight].join('|');
  }));
  expect(headings).toHaveLength(4);expect(new Set(headings).size).toBe(1);
  await expect(grid.locator(':scope > section > svg')).toHaveCount(4);
  const colors=await grid.locator(':scope > section > svg').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).color));
  expect(colors).toEqual(Array(4).fill('rgb(197, 26, 46)'));
  const textStyles=await grid.locator('.event-support-copy p, .event-support-copy strong, .event-support-copy a').evaluateAll(elements=>elements.map(element=>{
    const s=getComputedStyle(element);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight].join('|');
  }));
  expect(textStyles).toHaveLength(8);expect(new Set(textStyles).size).toBe(1);
  await expect(grid.getByRole('link',{name:'Email us at support@example.test'})).toHaveAttribute('href','mailto:support@example.test');
  await expect(grid.getByRole('link',{name:'Text us at 747-213-2155'})).toHaveAttribute('href','sms:+17472132155');
  expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
  await page.screenshot({path:info.outputPath('final-help.png'),fullPage:true});
});

test('Sonia final Home ends with the full-width Impact Arena feature after its sponsor ads', async ({page},info) => {
  const guide=await wire(page);guide.placements[0].surface='home';
  await page.goto('/');await settle(page);
  const feature=page.getByRole('region',{name:'WHY VISIT THE IMPACT ARENA',exact:true});
  await expect(feature).toBeVisible();
  await expect(feature.locator('p')).toHaveText('Meet our incredible partners, discover new products and services, grab breakfast, win prizes, and more... Your next connection could be waiting in the Impact Arena.');
  await expect(page.locator('.public-home > :last-child')).toHaveClass('impact-arena-feature');
  await expect(page.locator('#main .sponsor-creative')).toHaveCount(1);
  expect(await feature.evaluate(element=>Boolean(document.querySelector('.sponsor-creative')!.compareDocumentPosition(element)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(feature).toHaveCSS('background-color','rgb(20, 20, 23)');
  const width=await page.locator('.public-home').evaluate(element=>element.getBoundingClientRect().width);
  expect((await feature.boundingBox())!.width).toBeCloseTo(width,0);
  const sizes=await page.evaluate(()=>({welcome:parseFloat(getComputedStyle(document.querySelector('.home-hero h1')!).fontSize),impact:parseFloat(getComputedStyle(document.querySelector('.impact-arena-feature h2')!).fontSize)}));
  expect(sizes.impact/sizes.welcome).toBeGreaterThanOrEqual(0.8);expect(sizes.impact/sizes.welcome).toBeLessThanOrEqual(1.1);
  await expect(page.locator('.public-home .quick-links>a')).toHaveCount(8);
  await feature.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('final-impact-arena.png')});
  expect((await new AxeBuilder({page}).include('#main').analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('Sonia final speaker ads follow 14 speakers, 14 speakers and the remaining speakers without loss on search', async ({page}) => {
  const guide=await wire(page);
  guide.speakers=Array.from({length:45},(_,index)=>({...guide.speakers[0],id:`90000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,full_name:`Test Speaker ${String(index+1).padStart(2,'0')}`}));
  const sponsor=guide.sponsors[0];
  guide.sponsors=['Xactus','Figure','Total Expert'].map((name,index)=>({...sponsor,id:`91000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,name}));
  const creative=guide.placements[0];
  guide.placements=guide.sponsors.map((sponsor,index)=>({...creative,id:`92000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,sponsor_id:sponsor.id,surface:'speakers',sort_order:index+1}));
  await page.goto('/more/speakers');await settle(page);
  await expect(page.locator('.speaker-directory-card')).toHaveCount(45);
  const adPositions=()=>page.locator('.speakers-grid').evaluate(element=>{
    let speakers=0;return Array.from(element.children).flatMap(child=>{
      if(child.classList.contains('speaker-directory-card')){speakers++;return [];}
      return [{after:speakers,label:child.querySelector('.sponsor-creative')?.getAttribute('aria-label')}];
    });
  });
  const positions=await adPositions();expect(positions.map(position=>position.after)).toEqual([14,28,45]);
  ['Xactus','Figure','Total Expert'].forEach((name,index)=>expect(positions[index].label).toMatch(new RegExp('^'+name+':')));
  await page.getByRole('textbox',{name:'Search speakers'}).fill('Test Speaker 01');
  await expect(page.locator('.speaker-directory-card')).toHaveCount(1);
  expect((await adPositions()).map(position=>position.after)).toEqual([1,1,1]);
  await page.getByRole('textbox',{name:'Search speakers'}).fill('No match');
  await expect(page.locator('.speaker-inline-ad')).toHaveCount(0);
  await page.getByRole('button',{name:'Clear speaker search'}).click();
  expect((await adPositions()).map(position=>position.after)).toEqual([14,28,45]);
});

test('combined Help preserves venue reflow and honest clipboard success and failure', async ({ page }) => {
  const guide = await wire(page);
  const long = 'ExtraordinarilyLongUnbrokenVenueAndLocationName'.repeat(3);
  guide.venues = [{ ...guide.venues[0], title: long, location: long, is_demo: false, directions_url: 'https://example.test/directions' }];
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/more/help'); await settle(page);
  await expect(page.getByRole('heading', { name: long, exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }))).toEqual({ viewport: 320, width: 320 });
  const copy = page.getByRole('button', { name: `Copy address for ${long}`, exact: true });
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.copiedTest = text; } } }));
  await copy.click();
  await expect(page.getByText('Venue address copied.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.copiedTest)).toBe(long);
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard permission denied'); } } }));
  await copy.click();
  await expect(page.locator('.toast[role="alert"]')).toContainText('Copy is unavailable');
  await expect(page.getByRole('link', { name: 'Get directions', exact: false })).toHaveAttribute('href', guide.venues[0].directions_url);
});

test('ad CTA uses the sponsor website fallback and has no visible advertisement heading',async({page})=>{
  await wire(page);await page.goto('/more/lunch');await settle(page);
  const creative=page.locator('a.sponsor-creative:visible');await expect(creative).toHaveAttribute('href','https://partner.example/');
  await expect(creative.getByText('Visit their website',{exact:true})).toBeVisible();
  await expect(creative.locator('.sponsor-creative-label')).toHaveCount(0);
});

test('event help exposes venue, Wi-Fi and the PDF rather than a duplicate Venue page',async({page},info)=>{
  await wire(page);
  await page.goto('/more/help');await settle(page);await expect(page.getByText('Test-Meeting',{exact:true})).toBeVisible();await expect(page.getByText('Test2026',{exact:true})).toBeVisible();
  await expect(page.locator('a[href="/offline.html"]:visible')).toHaveCount(0);
  const support=page.locator('.event-support-copy:visible');await expect(support.getByRole('link',{name:'Email us at support@example.test'})).toHaveAttribute('href','mailto:support@example.test');
  await expect(support.getByRole('link',{name:'Text us at 747-213-2155'})).toHaveAttribute('href','sms:+17472132155');
  await expect(support.getByText('Or come to the registration table')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.getByRole('link',{name:/Hyatt Regency Dallas floor plan/})).toHaveAttribute('href',mapUrl);
  await page.screenshot({path:info.outputPath('venue-wifi.png'),fullPage:true});
});

test('organizer bold editing saves plain markup and copied ads remain unpublished until confirmation',async({page})=>{
  const guide=fixtureGuide();
  const session={...guide.sessions[0],speaker_ids:[],end_time_confirmed:true};
  let saved:Record<string,unknown>|null=null;
  await page.route('**/api/admin/guide',r=>r.fulfill({json:{...guide,mode:'live'}}));
  await page.route('**/api/me',r=>r.fulfill({json:{...demoMe,mode:'live'}}));
  await page.route('**/api/admin/lookups',r=>r.fulfill({json:{speakers:[],agenda_days:guide.days.map(d=>({id:d.id,label:d.label})),sponsors:guide.sponsors.map(s=>({id:s.id,label:s.name}))}}));
  await page.route('**/api/admin/content/agenda_sessions*',async r=>{
    if(r.request().method()==='POST'){saved=r.request().postDataJSON();Object.assign(session,(saved as {values:object}).values);return r.fulfill({json:{saved:true,record:{id:session.id}}});}
    return r.fulfill({json:{rows:[session],hasMore:false}});
  });
  await page.goto('/admin/agenda_sessions');await page.waitForLoadState('networkidle');
  await expect.poll(async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('focus')));return page.locator('.admin-demo').count();}).toBe(0);
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  const dialog=page.getByRole('dialog');const text=dialog.getByRole('textbox',{name:'Session description',exact:true});
  await text.fill('Hello everyone');await text.evaluate((element:HTMLTextAreaElement)=>{element.focus();element.setSelectionRange(6,14);});
  await dialog.getByRole('button',{name:'Bold selected description text'}).click();await expect(text).toHaveValue('Hello **everyone**');
  await expect(dialog.locator('.description-preview strong')).toHaveText('everyone');
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(saved).toMatchObject({id:session.id,values:{description:'Hello **everyone**'}});
  await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(text).toHaveValue('Hello **everyone**');await page.keyboard.press('Escape');
  const placement={...adminDefaults(adminResources.agenda_sponsor_placements),...guide.placements[0],id:'70000000-0000-4000-8000-000000000011'};
  let copies=0;
  await page.route('**/api/admin/content/agenda_sponsor_placements*',async r=>{if(r.request().method()==='POST'){copies++;return r.fulfill({json:{saved:true,record:{id:'new'}}});}return r.fulfill({json:{rows:[placement],hasMore:false}});});
  await page.goto('/admin/agenda_sponsor_placements');await page.getByRole('button',{name:'Copy placement'}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Add sponsor ad'})).toBeVisible();await expect(page.getByRole('checkbox',{name:'Published in the attendee guide',exact:true})).not.toBeChecked();
  expect(copies).toBe(0);
});
