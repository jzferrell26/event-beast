import { test, expect, type Page } from '@playwright/test';
const origin='http://127.0.0.1:3191';
async function signIn(page:Page,actor:string,next:string) {
  if(!process.env.BILLING_TEST_PASSWORD) throw new Error('Use the isolated billing qualification script.');
  await page.goto(`/platform/auth?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email address').fill(`${actor}@billing.example.test`);
  await page.getByLabel('Password',{exact:true}).fill(process.env.BILLING_TEST_PASSWORD);
  await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page).toHaveURL(`${origin}${next}`);
}
test('agency and customer billing views use the actually provisioned local account',async({browser},info)=>{
  const agency=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1000}});
  const customer=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});
  const other=await browser.newContext({baseURL:origin});
  try {
    const agencyPage=await agency.newPage(); await signIn(agencyPage,'agency','/agency/billing');
    await expect(agencyPage.getByRole('heading',{name:'Turn subscriptions into workspaces.'})).toBeVisible();
    await expect(agencyPage.getByRole('link',{name:'Open customer billing'})).toBeVisible();
    await agencyPage.screenshot({path:info.outputPath('agency-subscriptions.png'),fullPage:true});
    const owner=await customer.newPage(); await signIn(owner,'buyer','/app/sample-paid-organizer/billing');
    await expect(owner.getByRole('heading',{name:'Sample Paid Organizer'})).toBeVisible();
    await expect(owner.getByRole('button',{name:'Manage payment & invoices'})).toBeVisible();
    await expect(owner.getByText('Event allowance: 2.')).toBeVisible();
    expect(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await owner.screenshot({path:info.outputPath('customer-billing-mobile.png'),fullPage:true});
    const otherPage=await other.newPage(); await signIn(otherPage,'other','/platform/subscribe');
    await expect(otherPage.getByRole('heading',{name:'Make room for your next big event.'})).toBeVisible();
    await expect(otherPage.getByText('$49.00 / month',{exact:true})).toBeVisible();
    await otherPage.getByLabel('Organizer or business name').fill('Sample New Organizer');
    await otherPage.getByLabel('Workspace URL',{exact:true}).fill('sample-new-organizer');
    await otherPage.screenshot({path:info.outputPath('subscribe-desktop.png'),fullPage:true});
    expect((await other.request.get(`${origin}/api/billing/agency`)).status()).toBe(403);
    expect((await other.request.get(`${origin}/api/billing/organizations/sample-paid-organizer`)).status()).toBe(404);
    // No real checkout is opened: the provider wire contract was exercised by
    // the real-Postgres suite against its explicit Stripe HTTP fixture.
  } finally {await Promise.all([agency.close(),customer.close(),other.close()]);}
});
