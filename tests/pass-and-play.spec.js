// Full pass-and-play flow: setup picks, pass-device interstitials, strict
// alternating turns, auto-answered trait questions, and both game-over
// outcomes. Backend calls are intercepted with page.route() and fed a fixed
// fixture board — this suite never talks to Ktor/Firestore, same as
// board-views.spec.js.
const { test, expect } = require('@playwright/test');

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const board = {
  id: 'test-board',
  name: 'Test Board',
  targetSize: 6,
  status: 'COMPLETE',
  characters: [
    { id: 'alice', name: 'Alice', traits: ['glasses'], portraitUrl: PIXEL },
    { id: 'bob', name: 'Bob', traits: ['hat', 'beard'], portraitUrl: PIXEL },
    { id: 'carol', name: 'Carol', traits: ['glasses', 'earrings'], portraitUrl: PIXEL },
    { id: 'dave', name: 'Dave', traits: ['beard'], portraitUrl: PIXEL },
    { id: 'eve', name: 'Eve', traits: [], portraitUrl: PIXEL },
    { id: 'frank', name: 'Frank', traits: ['glasses', 'hat', 'beard', 'earrings'], portraitUrl: PIXEL },
  ],
  featureStatuses: [
    { id: 'glasses', label: 'Glasses', currentYes: 3, currentNo: 3, targetYesMin: 2, targetYesMax: 4, state: 'ON_TARGET' },
    { id: 'hat', label: 'Hat', currentYes: 2, currentNo: 4, targetYesMin: 1, targetYesMax: 3, state: 'ON_TARGET' },
    { id: 'beard', label: 'Beard', currentYes: 3, currentNo: 3, targetYesMin: 2, targetYesMax: 4, state: 'ON_TARGET' },
    { id: 'earrings', label: 'Earrings', currentYes: 2, currentNo: 4, targetYesMin: 1, targetYesMax: 3, state: 'ON_TARGET' },
  ],
  availableFeatures: [],
  minTraitsPerCharacter: 5,
  maxTraitsPerCharacter: 8,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/boards/test-board', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(board) })
  );
});

/** Picks `characterId` as the given player's secret and confirms. */
async function pickSecret(page, characterId) {
  await page.click(`#pickGrid .game-card[data-id="${characterId}"]`);
  await page.click('#confirmPickBtn');
}

/** Runs setup end to end: Player 1 secretly picks p1Id, Player 2 secretly picks p2Id. */
async function completeSetup(page, p1Id, p2Id, boardId = 'test-board') {
  await page.goto(`/#/board/${boardId}`);
  await page.click('#playBoardBtn');
  await expect(page.locator('#gameContent h1')).toHaveText('Player 1: pick your character');

  await pickSecret(page, p1Id);
  await expect(page.locator('#gameContent h1')).toHaveText('Pass the device to Player 2');
  await page.click('#passContinueBtn');

  await expect(page.locator('#gameContent h1')).toHaveText('Player 2: pick your character');
  await pickSecret(page, p2Id);
  await expect(page.locator('#gameContent h1')).toHaveText('Pass the device to Player 1');
  await page.click('#passContinueBtn');

  await expect(page.locator('#gameContent h1')).toHaveText("Player 1's turn");
}

test.describe('setup', () => {
  test('Play is reachable only from a COMPLETE board and starts on the Player 1 pick screen', async ({ page }) => {
    await page.goto('/#/board/test-board');
    await expect(page.locator('#playBoardBtn')).toBeVisible();
    await expect(page.locator('#completeBoardBtn')).toBeHidden();

    await page.click('#playBoardBtn');
    await expect(page).toHaveURL(/#\/board\/test-board\/play$/);
    await expect(page.locator('#gameContent h1')).toHaveText('Player 1: pick your character');
  });

  test('confirm pick is disabled until a character is selected', async ({ page }) => {
    await page.goto('/#/board/test-board/play');
    await expect(page.locator('#confirmPickBtn')).toBeDisabled();
    await page.click('#pickGrid .game-card[data-id="alice"]');
    await expect(page.locator('#confirmPickBtn')).toBeEnabled();
  });
});

test.describe('grouped trait categories', () => {
  const groupedBoard = {
    ...board,
    id: 'grouped-board',
    characters: [
      { id: 'alice', name: 'Alice', traits: ['hair_light'], portraitUrl: PIXEL },
      { id: 'bob', name: 'Bob', traits: ['hair_dark'], portraitUrl: PIXEL },
    ],
    featureStatuses: [
      { id: 'glasses', label: 'Glasses', currentYes: 1, currentNo: 1, targetYesMin: 0, targetYesMax: 2, state: 'ON_TARGET' },
      {
        id: 'hair_light',
        label: 'Light hair',
        currentYes: 1,
        currentNo: 1,
        targetYesMin: 0,
        targetYesMax: 2,
        state: 'ON_TARGET',
        groupLabel: 'Hair color',
      },
      {
        id: 'hair_dark',
        label: 'Dark hair',
        currentYes: 1,
        currentNo: 1,
        targetYesMin: 0,
        targetYesMax: 2,
        state: 'ON_TARGET',
        groupLabel: 'Hair color',
      },
    ],
  };

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/boards/grouped-board', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(groupedBoard) })
    );
  });

  test('a paired feature collapses into one category button that opens an option picker', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob', 'grouped-board');

    // Two mutually-exclusive features collapse into a single "Hair color" button,
    // not two separate flat trait buttons.
    await expect(page.locator('#traitAskGrid .trait-group-btn')).toHaveCount(1);
    await expect(page.locator('#traitAskGrid .trait-group-btn')).toHaveText(/Hair color/);
    await expect(page.locator('#traitAskGrid .trait-ask-btn[data-id="hair_light"]')).toHaveCount(0);

    await page.click('#traitAskGrid .trait-group-btn');
    await expect(page.locator('.trait-group-modal')).toBeVisible();
    await expect(page.locator('.trait-group-modal .trait-ask-btn[data-id="hair_light"]')).toBeVisible();
    await expect(page.locator('.trait-group-modal .trait-ask-btn[data-id="hair_dark"]')).toBeVisible();

    // Bob (Player 2's secret) has dark hair, so asking "Light hair?" answers No — the
    // category button just tracks how many of its options have been asked so far.
    await page.click('.trait-group-modal .trait-ask-btn[data-id="hair_light"]');
    await expect(page.locator('.trait-group-modal')).toBeHidden();
    await expect(page.locator('#traitAskGrid .trait-group-btn')).toContainText('1/2 asked');

    // The category is used up for the turn, same as any other trait-ask button.
    await expect(page.locator('#traitAskGrid .trait-group-btn')).toBeDisabled();
  });

  test('cancelling the option picker asks nothing and keeps the category open', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob', 'grouped-board');

    await page.click('#traitAskGrid .trait-group-btn');
    await page.click('#cancelTraitGroupBtn');
    await expect(page.locator('.trait-group-modal')).toBeHidden();
    await expect(page.locator('#traitAskGrid .trait-group-btn')).toBeEnabled();
    await expect(page.locator('#finalGuessBtn')).toBeVisible();
  });
});

test.describe('play-screen board cards', () => {
  test('the board hides names but a tap reveals name and traits in a dialog', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob');

    // Alice has ['glasses'] — the board itself shows no names, only portraits.
    await expect(page.locator('#playGrid .game-card-name')).toHaveCount(0);

    await page.click('#playGrid .game-card[data-id="alice"]');
    await expect(page.locator('.game-card-detail-modal')).toBeVisible();
    await expect(page.locator('.game-card-detail-modal h2')).toHaveText('Alice');
    await expect(page.locator('.game-card-detail-modal .modal-subtitle')).toHaveText('Glasses');

    await page.click('#closeGameCardDetailBtn');
    await expect(page.locator('.game-card-detail-modal')).toBeHidden();
    // Closing the dialog doesn't disturb the turn in progress.
    await expect(page.locator('#gameContent h1')).toHaveText("Player 1's turn");
  });

  test('a face-down (eliminated) card can still be inspected', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob');
    await page.click('#traitAskGrid .trait-ask-btn[data-id="glasses"]'); // No — eliminates glasses-wearers
    await expect(page.locator('#playGrid .game-card[data-id="carol"]')).toHaveClass(/game-card-facedown/);

    await page.click('#playGrid .game-card[data-id="carol"]');
    await expect(page.locator('.game-card-detail-modal h2')).toHaveText('Carol');
  });
});

test.describe('play', () => {
  test('each player has an independent candidate count', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob');
    await expect(page.locator('.counter-value')).toHaveText('6');

    // Player 1 asks "Glasses?" — Bob (Player 2's secret) has none, so the answer is No.
    await page.click('#traitAskGrid .trait-ask-btn[data-id="glasses"]');
    await expect(page.locator('#traitAskGrid .trait-ask-btn[data-id="glasses"]')).toBeDisabled();
    await expect(page.locator('#traitAskGrid .trait-ask-btn[data-id="glasses"] .trait-ask-answer')).toHaveText('No');
    // Consistent with "no glasses": Bob, Dave, Eve.
    await expect(page.locator('.counter-value')).toHaveText('3');

    await page.click('#endTurnBtn');
    await expect(page.locator('#gameContent h1')).toHaveText("Player 2's turn");
    // Player 2's own candidate count is untouched by Player 1's question.
    await expect(page.locator('.counter-value')).toHaveText('6');
  });

  test('a correct final guess wins the game and reveals both secrets', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob');

    await page.click('#traitAskGrid .trait-ask-btn[data-id="glasses"]');
    await page.click('#endTurnBtn');
    await expect(page.locator('#gameContent h1')).toHaveText("Player 2's turn");

    await page.click('#finalGuessBtn');
    await expect(page.locator('.guess-picker-modal')).toBeVisible();
    await page.click('#guessGrid .game-card[data-id="alice"]');
    await page.click('#confirmGuessBtn');

    await expect(page.locator('#gameContent h1')).toHaveText('Player 2 wins!');
    await expect(page.locator('.game-over-content .subtitle')).toHaveText('Player 2 guessed correctly!');
    const revealNames = await page.locator('.game-over-reveal .game-card-name').allTextContents();
    expect(revealNames.sort()).toEqual(['Alice', 'Bob']);
  });

  test('a wrong final guess is an immediate loss for the guesser', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob');

    await page.click('#finalGuessBtn');
    await page.click('#guessGrid .game-card[data-id="carol"]'); // not Bob's actual secret
    await page.click('#confirmGuessBtn');

    await expect(page.locator('#gameContent h1')).toHaveText('Player 2 wins!');
    await expect(page.locator('.game-over-content .subtitle')).toHaveText(
      'Player 1 guessed wrong — Player 2 wins by default.'
    );
  });

  test('play again resets to a fresh Player 1 pick screen', async ({ page }) => {
    await completeSetup(page, 'alice', 'bob');
    await page.click('#finalGuessBtn');
    await page.click('#guessGrid .game-card[data-id="carol"]');
    await page.click('#confirmGuessBtn');

    await page.click('#playAgainBtn');
    await expect(page.locator('#gameContent h1')).toHaveText('Player 1: pick your character');
    await expect(page.locator('#confirmPickBtn')).toBeDisabled();
  });
});
