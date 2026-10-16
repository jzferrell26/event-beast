import { expect, test } from '@playwright/test';

test('the agency hostname opens agency while Momentum Builder keeps its event routes', async ({ request }) => {
  const agency = await request.get('/', { headers: { Host: 'eventbeast.jonathanferrell.com' }, maxRedirects: 0 });
  expect(agency.status()).toBe(307);
  expect(new URL(agency.headers().location, 'https://eventbeast.jonathanferrell.com').pathname).toBe('/agency');

  for (const host of ['eventapp.momentumbuilder.com', '2026live.momentumbuilder.com']) {
    const response = await request.get('/', { headers: { Host: host }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers().location).toBeUndefined();
  }
});
