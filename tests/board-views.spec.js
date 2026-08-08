// Board list + board detail rendering. Backend calls are intercepted with
// page.route() and fed fixtures — this suite never talks to Ktor/Firestore.
const { test, expect } = require('@playwright/test');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const boardSummaries = [
  { id: 'b1', name: 'The Smiths', targetSize: 6, characterCount: 2, status: 'IN_PROGRESS', updatedAt: '' },
  { id: 'b2', name: 'Office', targetSize: 4, characterCount: 4, status: 'COMPLETE', updatedAt: '' },
];

const inProgressBoard = {
  id: 'b1',
  name: 'The Smiths',
  targetSize: 6,
  status: 'IN_PROGRESS',
  characters: [
    { id: 'alice', name: 'Alice', traits: ['glasses'], portraitUrl: PIXEL },
    { id: 'bob', name: 'Bob', traits: [], portraitUrl: PIXEL },
  ],
  featureStatuses: [
    { id: 'glasses', label: 'Glasses', currentYes: 1, currentNo: 1, targetYesMin: 2, targetYesMax: 4, state: 'TOO_FEW' },
  ],
  availableFeatures: [
    { id: 'glasses', label: 'Glasses', available: true, reason: null, exclusiveWith: [] },
    { id: 'hat', label: 'Hat', available: false, reason: 'Hat is already at target.', exclusiveWith: [] },
  ],
  minTraitsPerCharacter: 1,
  maxTraitsPerCharacter: 8,
};

const completeBoard = {
  ...inProgressBoard,
  id: 'b2',
  name: 'Office',
  targetSize: 2,
  status: 'COMPLETE',
  characters: [
    { id: 'alice', name: 'Alice', traits: ['glasses'], portraitUrl: PIXEL },
    { id: 'bob', name: 'Bob', traits: [], portraitUrl: PIXEL },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/boards', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardSummaries) })
  );
  await page.route('**/api/boards/b1', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inProgressBoard) })
  );
  await page.route('**/api/boards/b2', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(completeBoard) })
  );
});

test.describe('board list', () => {
  test('renders each board as a card with name, progress, and status badge', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.board-card')).toHaveCount(2);

    const smiths = page.locator('.board-card', { hasText: 'The Smiths' });
    await expect(smiths.locator('.board-card-meta')).toHaveText('2/6 characters');
    await expect(smiths.locator('.badge')).toHaveText('In progress');

    const office = page.locator('.board-card', { hasText: 'Office' });
    await expect(office.locator('.badge')).toHaveText('Complete');
  });
});

test.describe('board detail', () => {
  test('renders the character grid and feature balance panel for an in-progress board', async ({ page }) => {
    await page.goto('/#/board/b1');
    await expect(page.locator('.character-card')).toHaveCount(2);

    const aliceCard = page.locator('.character-card', { hasText: 'Alice' });
    await expect(aliceCard.locator('.character-card-traits')).toHaveText('Glasses');

    const bobCard = page.locator('.character-card', { hasText: 'Bob' });
    await expect(bobCard.locator('.character-card-traits')).toHaveText('No features');

    await expect(page.locator('.feature-balance-pill')).toContainText('Glasses');
    await expect(page.locator('.feature-balance-count')).toHaveText('1/2–4');
  });

  test('shows a disabled complete button and hides Play while in progress', async ({ page }) => {
    await page.goto('/#/board/b1');
    await expect(page.locator('#completeBoardBtn')).toBeVisible();
    await expect(page.locator('#completeBoardBtn')).toBeDisabled();
    await expect(page.locator('#playBoardBtn')).toBeHidden();
  });

  test('shows an enabled Play link and hides the complete button once COMPLETE', async ({ page }) => {
    await page.goto('/#/board/b2');
    await expect(page.locator('#completeBoardBtn')).toBeHidden();
    await expect(page.locator('#playBoardBtn')).toBeVisible();
    await expect(page.locator('#playBoardBtn')).toHaveAttribute('href', '#/board/b2/play');
  });
});
