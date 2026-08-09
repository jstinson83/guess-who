// Photo Library screen: grid, click-to-modal with detected features, and delete. Backend calls
// are intercepted with page.route() and fed fixtures — this suite never talks to Ktor/Firestore.
// The add-photo crop flow isn't covered here, same as board-views.spec.js doesn't cover the
// board add-character crop flow — Cropper.js interaction isn't exercised by this suite.
const { test, expect } = require('@playwright/test');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const features = [
  { id: 'glasses', label: 'Glasses' },
  { id: 'hat', label: 'Hat' },
];

const libraryPhotos = [
  { id: 'p1', detectedFeatures: ['glasses'], imageUrl: PIXEL, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', detectedFeatures: [], imageUrl: PIXEL, createdAt: '2026-01-02T00:00:00Z' },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/features', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(features) })
  );
  await page.route('**/api/photobank/default/photos', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(libraryPhotos) });
    }
    return route.continue();
  });
});

test.describe('photo library grid', () => {
  test('renders each bank photo as a tile with its detected-feature count', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.locator('#photoBankGrid .character-card')).toHaveCount(2);
    await expect(page.locator('#photoBankGrid .character-card', { hasText: '1 feature detected' })).toHaveCount(1);
    await expect(page.locator('#photoBankGrid .character-card', { hasText: '0 features detected' })).toHaveCount(1);
  });

  test('shows an empty state when the library has no photos', async ({ page }) => {
    await page.unroute('**/api/photobank/default/photos');
    await page.route('**/api/photobank/default/photos', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return route.continue();
    });

    await page.goto('/#/library');
    await expect(page.locator('#photoBankGrid')).toContainText('No photos yet');
  });

  test('highlights the Photo Library nav link while on the library screen', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.locator('#navLibrary')).toHaveClass(/top-nav-link-active/);
    await expect(page.locator('#navBoards')).not.toHaveClass(/top-nav-link-active/);
  });
});

test.describe('photo library modal', () => {
  test('clicking a tile opens a modal with the photo and its full detected-feature list', async ({ page }) => {
    await page.goto('/#/library');
    await page.locator('#photoBankGrid .character-card').first().click();

    await expect(page.locator('#characterModal')).toBeVisible();
    await expect(page.locator('#characterModalTitle')).toHaveText('Library photo');
    await expect(page.locator('#characterModalSubtitle')).toHaveText('Glasses');
  });

  test('shows "No features detected" for a photo with none', async ({ page }) => {
    await page.goto('/#/library');
    await page.locator('#photoBankGrid .character-card', { hasText: '0 features detected' }).click();

    await expect(page.locator('#characterModalSubtitle')).toHaveText('No features detected');
  });

  test('dismissing the modal stays on the library screen', async ({ page }) => {
    await page.goto('/#/library');
    await page.locator('#photoBankGrid .character-card').first().click();
    await page.locator('#characterModalDismissBtn').click();

    await expect(page.locator('#characterModal')).toBeHidden();
    await expect(page.locator('#libraryView')).toBeVisible();
  });

  test('deleting a photo removes it from the grid', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.route('**/api/photobank/default/photos/p1', (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ status: 204 });
      }
      return route.continue();
    });

    await page.goto('/#/library');
    await expect(page.locator('#photoBankGrid .character-card')).toHaveCount(2);

    await page.locator('#photoBankGrid .character-card', { hasText: '1 feature detected' }).click();
    await page.locator('#characterModalDeleteBtn').click();

    await expect(page.locator('#characterModal')).toBeHidden();
    await expect(page.locator('#photoBankGrid .character-card')).toHaveCount(1);
  });
});
