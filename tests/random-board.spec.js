// Generate-random-board: the Photo Library entry point/modal, and the board detail screen's
// client-paced step loop (POST /random then repeated POST /{id}/random/step calls) — see
// .claude/context.md's "Client-paced generation" decision for why there's no server-side
// background job driving this instead. Backend calls are intercepted with page.route() and fed
// fixtures — this suite never talks to Ktor/Firestore/Gemini.
const { test, expect } = require('@playwright/test');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function board(overrides) {
  return {
    id: 'rb1',
    name: 'Random Crew',
    targetSize: 3,
    status: 'GENERATING',
    characters: [],
    featureStatuses: [],
    availableFeatures: [],
    minTraitsPerCharacter: 1,
    maxTraitsPerCharacter: 8,
    generationError: null,
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/photobank/default/photos', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.continue();
  });
});

test.describe('generate-random-board modal', () => {
  test('the Photo Library screen offers a generate-random-board entry point', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.locator('#randomBoardModal')).toBeHidden();

    await page.locator('#generateRandomBoardBtn').click();
    await expect(page.locator('#randomBoardModal')).toBeVisible();

    await page.locator('#randomBoardCancelBtn').click();
    await expect(page.locator('#randomBoardModal')).toBeHidden();
  });

  test('rejects a blank name without calling the backend', async ({ page }) => {
    let called = false;
    await page.route('**/api/boards/random', (route) => {
      called = true;
      return route.continue();
    });

    await page.goto('/#/library');
    await page.locator('#generateRandomBoardBtn').click();
    await page.locator('#randomBoardGenerateBtn').click();

    await expect(page.locator('#randomBoardStatus')).toHaveText('Give the board a name first.');
    await expect(page.locator('#randomBoardModal')).toBeVisible();
    expect(called).toBe(false);
  });

  test('surfaces a backend error without navigating away', async ({ page }) => {
    await page.route('**/api/boards/random', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'The photo library has no photos yet — add some first' }) })
    );

    await page.goto('/#/library');
    await page.locator('#generateRandomBoardBtn').click();
    await page.locator('#randomBoardName').fill('Random Crew');
    await page.locator('#randomBoardGenerateBtn').click();

    await expect(page.locator('#randomBoardStatus')).toHaveText('The photo library has no photos yet — add some first');
    await expect(page.locator('#randomBoardModal')).toBeVisible();
  });
});

test.describe('board detail generation progress', () => {
  test('polls /random/step to fill the board, then shows the finished board', async ({ page }) => {
    let stepCount = 0;

    await page.route('**/api/boards/random', (route) =>
      route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify(board()) })
    );
    await page.route('**/api/boards/rb1', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(board()) });
      }
      return route.continue();
    });
    await page.route('**/api/boards/rb1/random/step', async (route) => {
      // No artificial delay needed here — boards.js's poll loop already waits ~2s between calls
      // (see RANDOM_BOARD_POLL_MS), which is enough for the test to observe the GENERATING
      // state mid-run instead of racing straight past it.
      stepCount += 1;
      const characters = Array.from({ length: Math.min(stepCount, 3) }, (_, i) => ({
        id: `c${i}`,
        name: `Character ${i + 1}`,
        traits: ['glasses'],
        portraitUrl: PIXEL,
      }));
      const status = characters.length >= 3 ? 'IN_PROGRESS' : 'GENERATING';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(board({ characters, status })),
      });
    });

    await page.goto('/#/library');
    await page.locator('#generateRandomBoardBtn').click();
    await page.locator('#randomBoardName').fill('Random Crew');
    await page.locator('#randomBoardGenerateBtn').click();

    await expect(page).toHaveURL(/#\/board\/rb1$/);
    await expect(page.locator('#boardGeneratingBanner')).toBeVisible();
    await expect(page.locator('#fabContainer')).toBeHidden();
    await expect(page.locator('#completeBoardBtn')).toBeHidden();

    await expect(page.locator('#boardGeneratingBanner')).toBeHidden({ timeout: 10000 });
    await expect(page.locator('.character-card')).toHaveCount(3);
    await expect(page.locator('#completeBoardBtn')).toBeVisible();
  });

  test('shows the generationError note once a run stops short of target size', async ({ page }) => {
    await page.route('**/api/boards/rb1', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            board({
              status: 'IN_PROGRESS',
              characters: [{ id: 'c0', name: 'Character 1', traits: ['glasses'], portraitUrl: PIXEL }],
              generationError: "Generated 1 of 3 — the available feature pool is exhausted for this board's targets. Add the rest manually, or raise the target size.",
            })
          ),
        });
      }
      return route.continue();
    });

    await page.goto('/#/board/rb1');
    await expect(page.locator('#boardGeneratingBanner')).toBeHidden();
    await expect(page.locator('#boardGenerationNotice')).toBeVisible();
    await expect(page.locator('#boardGenerationNotice')).toContainText('feature pool is exhausted');
    await expect(page.locator('#resumeGenerationBtn')).toBeVisible();
  });

  test('resuming a stalled run clears the notice and starts polling again', async ({ page }) => {
    let resumed = false;

    await page.route('**/api/boards/rb1', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            board({
              status: 'IN_PROGRESS',
              characters: [{ id: 'c0', name: 'Character 1', traits: ['glasses'], portraitUrl: PIXEL }],
              generationError: 'Generated 1 of 3 — the photo library is empty. Add photos to the library, or add the rest manually.',
            })
          ),
        });
      }
      return route.continue();
    });
    await page.route('**/api/boards/rb1/random/resume', (route) => {
      resumed = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          board({
            status: 'GENERATING',
            characters: [{ id: 'c0', name: 'Character 1', traits: ['glasses'], portraitUrl: PIXEL }],
          })
        ),
      });
    });
    await page.route('**/api/boards/rb1/random/step', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          board({
            status: 'IN_PROGRESS',
            characters: Array.from({ length: 3 }, (_, i) => ({
              id: `c${i}`,
              name: `Character ${i + 1}`,
              traits: ['glasses'],
              portraitUrl: PIXEL,
            })),
          })
        ),
      })
    );

    await page.goto('/#/board/rb1');
    await expect(page.locator('#resumeGenerationBtn')).toBeVisible();

    await page.locator('#resumeGenerationBtn').click();
    expect(resumed).toBe(true);

    await expect(page.locator('#boardGenerationNotice')).toBeHidden();
    await expect(page.locator('#resumeGenerationBtn')).toBeHidden();
    await expect(page.locator('.character-card')).toHaveCount(3, { timeout: 10000 });
  });
});
