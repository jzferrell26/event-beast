import { test, expect } from '@playwright/test';

test('workspace email links are scanner-safe and expired links stay in Event Beast', async ({ page, request }) => {
  // Deliberately invalid token: this test does not create or consume any Auth credential.
  const link = '/auth/confirm?context=workspace&type=invite&token_hash=' + 'a'.repeat(64);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(link);
    await expect(page).toHaveTitle('Continue securely | Event Beast');
    await expect(page.getByRole('button', { name: 'Continue securely' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/platform/auth');
  }
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3190/platform/auth?error=link');
  await expect(page.getByRole('alert')).toContainText('expired or was already used');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await request.get('/api/platform/agency')).status()).toBe(401);
});
