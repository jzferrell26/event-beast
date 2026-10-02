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

test('Lunch Break links to the matching date on the Lunch page',async({page})=>{
  await wire(page,true);await page.goto('/agenda');await settle(page);
  await page.getByRole('tab',{name:/Day 2/}).click();
  const lunch=page.locator('.session-card',{hasText:'Lunch Break'});
  await expect(lunch.getByRole('link',{name:'View lunch options'})).toHaveAttribute('href','/more/lunch#lunch-2026-10-07');
  await lunch.getByRole('link',{name:'View lunch options'}).click();
  await expect(page).toHaveURL(/\/more\/lunch#lunch-2026-10-07$/);
  await expect(page.locator('#lunch-2026-10-07')).toBeVisible();
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

test('ad CTA uses the sponsor website fallback and has no visible advertisement heading',async({page})=>{
  await wire(page);await page.goto('/more/lunch');await settle(page);
  const creative=page.locator('a.sponsor-creative:visible');await expect(creative).toHaveAttribute('href','https://partner.example/');
  await expect(creative.getByText('Visit their website',{exact:true})).toBeVisible();
  await expect(creative.locator('.sponsor-creative-label')).toHaveCount(0);
});

test('event help and Find your way expose Wi-Fi and the PDF rather than offline promotion',async({page},info)=>{
  await wire(page);
  for(const path of ['/more/help','/more/venue']){
    await page.goto(path);await settle(page);await expect(page.getByText('Test-Meeting',{exact:true})).toBeVisible();await expect(page.getByText('Test2026',{exact:true})).toBeVisible();
    await expect(page.locator('a[href="/offline.html"]:visible')).toHaveCount(0);
    const support=page.locator('.event-support-copy:visible');await expect(support.getByRole('link',{name:'Email us at support@example.test'})).toHaveAttribute('href','mailto:support@example.test');
    await expect(support.getByRole('link',{name:'Text us at 747-213-2155'})).toHaveAttribute('href','sms:+17472132155');
    await expect(support.getByText('Or come to the registration table')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
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
