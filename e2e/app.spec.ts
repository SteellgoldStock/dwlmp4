import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { ready: true } }));
});

test('the real development proxy preserves same-origin submissions', async ({ page }) => {
  await page.goto('/');
  // Do not mock this endpoint: exercise the Vite → Express boundary without contacting a platform.
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/downloads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/not-supported' }),
    });
    return { status: response.status, body: (await response.json()) as { error: string } };
  });
  expect(result.status).toBe(400);
  expect(result.body.error).toContain('Seuls les liens HTTPS');
});

test('form, FAQ and responsive layout', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/À garder/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Une vidéo.');
  await expect(page.getByRole('button', { name: 'Récupérer la vidéo' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true });
  await page.getByLabel('Le lien de votre vidéo').fill('https://www.instagram.com/reel/ABC/');
  await expect(page.getByRole('button', { name: 'Récupérer la vidéo' })).toBeEnabled();
  await page.getByText('Est-ce que le filigrane est retiré ?').click();
  await expect(page.getByText('Elle ne garantit pas', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('recovers from an invalid link', async ({ page }) => {
  await page.route('**/api/downloads', (route) =>
    route.fulfill({
      status: 400,
      json: { error: 'Seuls les liens HTTPS Instagram et TikTok sont acceptés.' },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Le lien de votre vidéo').fill('https://example.com/video');
  await page.getByRole('button', { name: 'Récupérer la vidéo' }).click();
  await expect(page.getByRole('alert')).toContainText('Seuls les liens HTTPS');
  await expect(page.getByRole('button', { name: 'Récupérer la vidéo' })).toBeEnabled();
});

test('shows real job states and offers an MP4 attachment (mocked API)', async ({ page }) => {
  const id = 'test-job';
  await page.route('**/api/downloads', (route) =>
    route.fulfill({
      status: 202,
      json: { id, platform: 'instagram', status: 'processing', progress: 2 },
    }),
  );
  await page.route(`**/api/downloads/${id}`, (route) =>
    route.fulfill({
      json: {
        id,
        platform: 'instagram',
        status: 'ready',
        progress: 100,
        title: 'La recette du dimanche',
        uploader: 'Ma cuisine',
        size: 1024 * 1024 * 5,
        duration: 48,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Le lien de votre vidéo').fill('https://www.instagram.com/reel/ABC/');
  await page.getByRole('button', { name: 'Récupérer la vidéo' }).click();
  await expect(page.getByText('C’est dans la poche.')).toBeVisible();
  await expect(
    page.locator('.video-details').getByText('La recette du dimanche', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('MP4 · 5 Mo · 0:48')).toBeVisible();
  const file = page.getByRole('link', { name: 'Télécharger le MP4' });
  await expect(file).toHaveAttribute('href', `/api/downloads/${id}/file`);
  await expect(file).toHaveAttribute('download', '');
  await page.getByRole('button', { name: 'Une autre vidéo ?' }).click();
  await expect(page.getByLabel('Le lien de votre vidéo')).toHaveValue('');
});

test('explains platform blocks and allows a retry', async ({ page }) => {
  await page.route('**/api/downloads', (route) =>
    route.fulfill({
      status: 202,
      json: { id: 'blocked', platform: 'tiktok', status: 'processing', progress: 2 },
    }),
  );
  await page.route('**/api/downloads/blocked', (route) =>
    route.fulfill({
      json: {
        id: 'blocked',
        platform: 'tiktok',
        status: 'error',
        progress: 2,
        error: 'La plateforme bloque la récupération pour le moment.',
      },
    }),
  );
  await page.goto('/');
  const url = 'https://www.tiktok.com/@chef/video/123';
  await page.getByLabel('Le lien de votre vidéo').fill(url);
  await page.getByRole('button', { name: 'Récupérer la vidéo' }).click();
  await expect(page.getByRole('alert')).toContainText('La plateforme bloque');
  await page.getByRole('button', { name: 'Réessayer avec ce lien' }).click();
  await expect(page.getByLabel('Le lien de votre vidéo')).toHaveValue(url);
});

test('shows an actionable setup message when the engine is missing', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { ready: false, message: 'Lancez npm run setup:engine.' } }),
  );
  await page.goto('/');
  await expect(page.getByText('Lancez npm run setup:engine.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Récupérer la vidéo' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Vérifier à nouveau' })).toBeVisible();
});
