// Chunk 4 of the Photo Library plan: the board add-character flow forking into "choose from
// library" as an alternative to upload/camera. Picking a library photo skips crop and skips a
// second detectTraits() call — its already-detected features come along for the ride. Backend
// calls are intercepted with page.route() and fed fixtures — this suite never talks to
// Ktor/Firestore/Gemini.
const { test, expect } = require('@playwright/test');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const board = {
  id: 'b1',
  name: 'The Smiths',
  targetSize: 6,
  status: 'IN_PROGRESS',
  characters: [{ id: 'alice', name: 'Alice', traits: ['glasses'], portraitUrl: PIXEL, sourcePhotoId: null }],
  featureStatuses: [
    { id: 'glasses', label: 'Glasses', currentYes: 1, currentNo: 0, targetYesMin: 2, targetYesMax: 4, state: 'TOO_FEW' },
    { id: 'hat', label: 'Hat', currentYes: 0, currentNo: 1, targetYesMin: 0, targetYesMax: 1, state: 'ON_TARGET' },
  ],
  availableFeatures: [
    { id: 'glasses', label: 'Glasses', available: true, reason: null, exclusiveWith: [] },
    { id: 'hat', label: 'Hat', available: false, reason: 'Hat is already at target.', exclusiveWith: [] },
  ],
  minTraitsPerCharacter: 1,
  maxTraitsPerCharacter: 8,
};

const libraryPhotos = [
  { id: 'p1', detectedFeatures: ['glasses', 'hat'], imageUrl: PIXEL, createdAt: '2026-01-02T00:00:00Z' },
  { id: 'p2', detectedFeatures: [], imageUrl: PIXEL, createdAt: '2026-01-01T00:00:00Z' },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/boards/b1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(board) });
    }
    return route.continue();
  });
  await page.route('**/api/photobank/default/photos', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(libraryPhotos) });
    }
    return route.continue();
  });
});

test.describe('choose from library entry point', () => {
  test('the add-character FAB offers a library option that opens the picker', async ({ page }) => {
    await page.goto('/#/board/b1');
    await page.locator('#fabMain').click();
    await page.locator('#fabLibrary').click();

    await expect(page).toHaveURL(/#\/board\/b1\/pick-photo$/);
    await expect(page.locator('#boardLibraryPickView')).toBeVisible();
    await expect(page.locator('#libraryPickGrid .character-card')).toHaveCount(2);
  });

  test('cancelling the picker returns to the board detail screen', async ({ page }) => {
    await page.goto('/#/board/b1/pick-photo');
    await page.locator('#libraryPickBackBtn').click();

    await expect(page).toHaveURL(/#\/board\/b1$/);
    await expect(page.locator('#boardDetailView')).toBeVisible();
  });

  test('shows an empty state when the library has no photos', async ({ page }) => {
    await page.unroute('**/api/photobank/default/photos');
    await page.route('**/api/photobank/default/photos', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );

    await page.goto('/#/board/b1/pick-photo');
    await expect(page.locator('#libraryPickGrid')).toContainText('No photos in the library yet');
  });
});

test.describe('picking a library photo', () => {
  test('skips straight to features with the stored detected features pre-checked, no detect-traits call', async ({ page }) => {
    let detectTraitsCalled = false;
    await page.route('**/api/boards/b1/characters/detect-traits', (route) => {
      detectTraitsCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ traitIds: [] }) });
    });

    await page.goto('/#/board/b1/pick-photo');
    await page.locator('#libraryPickGrid .character-card').first().click();

    await expect(page).toHaveURL(/#\/board\/b1\/features$/);
    await expect(page.locator('#featuresView')).toBeVisible();

    // Photo p1 detected both glasses and hat; hat isn't available on this board (already at
    // target), so only glasses should end up checked — same availability-gating renderTraits()
    // already applies to a freshly detected photo.
    await expect(page.locator('#traits input[value="glasses"]')).toBeChecked();
    await expect(page.locator('#traits input[value="hat"]')).toBeDisabled();
    await expect(page.locator('#traits input[value="hat"]')).not.toBeChecked();

    expect(detectTraitsCalled).toBe(false);
  });

  test('creating the character posts bankId/bankPhotoId instead of an image file', async ({ page }) => {
    let capturedFields = null;
    await page.route('**/api/boards/b1/characters', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const postData = route.request().postData() || '';
      capturedFields = {
        hasImage: postData.includes('name="image"'),
        hasBankId: postData.includes('name="bankId"') && postData.includes('default'),
        hasBankPhotoId: postData.includes('name="bankPhotoId"') && postData.includes('p1'),
      };
      const created = {
        ...board,
        characters: [...board.characters, { id: 'newchar', name: 'Jordan', traits: ['glasses'], portraitUrl: PIXEL, sourcePhotoId: 'p1' }],
      };
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    });

    await page.goto('/#/board/b1/pick-photo');
    await page.locator('#libraryPickGrid .character-card').first().click();
    await page.locator('#personName').fill('Jordan');
    await page.locator('#generateBtn').click();

    await expect(page.locator('#characterModal')).toBeVisible();
    await expect(page.locator('#characterModalSubtitle')).toHaveText('Jordan');
    expect(capturedFields).toEqual({ hasImage: false, hasBankId: true, hasBankPhotoId: true });
  });

  test('canceling out of features clears the pending library photo', async ({ page }) => {
    await page.goto('/#/board/b1/pick-photo');
    await page.locator('#libraryPickGrid .character-card').first().click();
    await expect(page).toHaveURL(/#\/board\/b1\/features$/);

    await page.locator('#featuresBackBtn').click();
    await expect(page).toHaveURL(/#\/board\/b1$/);

    // Re-entering features directly (no pending photo or blobs) should bounce back to the board.
    await page.goto('/#/board/b1/features');
    await expect(page).toHaveURL(/#\/board\/b1$/);
  });
});
