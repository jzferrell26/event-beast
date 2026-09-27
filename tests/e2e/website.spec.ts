import { test, expect } from '@playwright/test';
import { demoProfiles, demoGuide } from '../../src/lib/demo';

test('join is a website flow with persistent-session and private-contact guidance', async ({ page }) => {
  await page.goto('/join');
  await expect(page.getByRole('heading', { name: 'Make your entrance.' })).toBeVisible();
  await expect(page.locator('.auth-description')).toContainText('No app download needed');
  await expect(page.locator('.auth-assurance')).toContainText('Only event Admins');
  await page.locator('input[autocomplete="email"]').fill('sample@example.test');
  await page.locator('input[autocomplete="new-password"]').nth(0).fill('Sample-password-123');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('Sample-password-123');
  await page.getByRole('button', { name: 'Create my account', exact: true }).click();
  await expect(page.locator('.auth-panel').getByRole('alert')).toContainText('No account or email is created');
});

test('profiles expose no contact collection fields and directory responses omit contact properties', async ({ page, request }) => {
  await page.goto('/more/profile');
  await expect(page.locator('input[type="email"],input[type="tel"],input[type="url"]')).toHaveCount(0);
  await expect(page.locator('#main .privacy-hint')).toContainText('available only to event Admins');
  const response = await request.get(`/api/people/${demoProfiles[0].attendee_id}`);
  expect(response.status()).toBe(200);
  const { profile } = await response.json();
  for (const key of ['email', 'phone', 'website', 'public_email', 'public_phone', 'registration_email', 'contact_email']) expect(profile).not.toHaveProperty(key);
});

test('speaker directory links to a biography and related sessions', async ({ page }) => {
  await page.goto('/more/speakers');
  await expect(page.getByRole('heading', { name: 'Meet your speakers.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search speakers' }).fill(demoGuide.speakers[0].full_name);
  await expect(page.locator('.people-grid > a')).toHaveCount(1);
  await page.locator('.people-grid > a').click();
  await expect(page.getByRole('heading', { name: demoGuide.speakers[0].full_name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Catch them on the agenda' })).toBeVisible();
});

test('Admin contact tools are separate from the public attendee profile', async ({ page }) => {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: `Private contact information for ${demoProfiles[0].full_name}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Private contact information' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: /Verified registration email/ })).toHaveValue('attendee1@example.test');
  await expect(dialog).toContainText('Sponsors and members cannot access');
});
