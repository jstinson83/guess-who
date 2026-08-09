// Unit tests for templates.js — the `data -> HTML string` functions the
// rest of the frontend renders through (see CLAUDE.md's "Frontend has no
// build step" gotcha). Run in a real page (not jsdom) because escapeHtml
// uses document.createElement, and because that's the same environment the
// app actually runs in.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: 'backend/src/main/resources/static/templates.js' });
});

test.describe('escapeHtml', () => {
  test('escapes HTML-significant characters', async ({ page }) => {
    const result = await page.evaluate(() => escapeHtml('<script>alert("hi")</script> & "quotes"'));
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('treats null/undefined as an empty string', async ({ page }) => {
    expect(await page.evaluate(() => escapeHtml(null))).toBe('');
    expect(await page.evaluate(() => escapeHtml(undefined))).toBe('');
  });
});

test.describe('boardCardHtml', () => {
  test('renders name, character count, and an in-progress badge', async ({ page }) => {
    const html = await page.evaluate(() =>
      boardCardHtml({ name: 'The Smiths', characterCount: 2, targetSize: 6, status: 'IN_PROGRESS' })
    );
    expect(html).toContain('The Smiths');
    expect(html).toContain('2/6 characters');
    expect(html).toContain('badge-in_progress');
    expect(html).toContain('In progress');
  });

  test('renders a complete badge for a COMPLETE board', async ({ page }) => {
    const html = await page.evaluate(() =>
      boardCardHtml({ name: 'X', characterCount: 6, targetSize: 6, status: 'COMPLETE' })
    );
    expect(html).toContain('badge-complete');
    expect(html).toContain('Complete');
  });

  test('escapes an untrusted board name', async ({ page }) => {
    const html = await page.evaluate(() =>
      boardCardHtml({ name: '<img src=x onerror=alert(1)>', characterCount: 0, targetSize: 1, status: 'IN_PROGRESS' })
    );
    expect(html).not.toContain('<img src=x');
  });
});

test.describe('featureBalancePillHtml', () => {
  test('renders the label and current/target counts', async ({ page }) => {
    const html = await page.evaluate(() =>
      featureBalancePillHtml({ label: 'Glasses', currentYes: 3, targetYesMin: 2, targetYesMax: 4 })
    );
    expect(html).toContain('Glasses');
    expect(html).toContain('3/2');
    expect(html).toContain('4');
  });
});

test.describe('characterCardHtml', () => {
  test('renders portrait, name, and trait labels', async ({ page }) => {
    const html = await page.evaluate(() =>
      characterCardHtml({ portraitUrl: '/p.png', name: 'Alice' }, 'Glasses, Hat')
    );
    expect(html).toContain('/p.png');
    expect(html).toContain('Alice');
    expect(html).toContain('Glasses, Hat');
  });

  test('falls back to "Unnamed" / "No features" for empty values', async ({ page }) => {
    const html = await page.evaluate(() => characterCardHtml({ portraitUrl: '', name: '' }, ''));
    expect(html).toContain('Unnamed');
    expect(html).toContain('No features');
  });
});

test.describe('photoBankCardHtml', () => {
  test('renders the photo and a singular feature count', async ({ page }) => {
    const html = await page.evaluate(() =>
      photoBankCardHtml({ imageUrl: '/p.png', detectedFeatures: ['glasses'] })
    );
    expect(html).toContain('/p.png');
    expect(html).toContain('1 feature detected');
  });

  test('pluralizes the count for zero or multiple features', async ({ page }) => {
    const zero = await page.evaluate(() => photoBankCardHtml({ imageUrl: '', detectedFeatures: [] }));
    expect(zero).toContain('0 features detected');

    const many = await page.evaluate(() =>
      photoBankCardHtml({ imageUrl: '', detectedFeatures: ['glasses', 'hat'] })
    );
    expect(many).toContain('2 features detected');
  });
});

test.describe('traitSwitchHtml', () => {
  test('renders a checked, enabled input for an available, selected feature', async ({ page }) => {
    const html = await page.evaluate(() =>
      traitSwitchHtml({
        feature: { id: 'glasses', label: 'Glasses', exclusiveWith: [], available: true },
        shouldCheck: true,
        status: { currentYes: 3, targetYesMin: 2, targetYesMax: 4 },
        stateClass: 'on_target',
        reason: '',
      })
    );
    expect(html).toContain('checked');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Glasses');
    expect(html).toContain('switch-count-on_target');
  });

  test('renders a disabled input with its reason for an unavailable feature', async ({ page }) => {
    const html = await page.evaluate(() =>
      traitSwitchHtml({
        feature: { id: 'hat', label: 'Hat', exclusiveWith: [], available: false },
        shouldCheck: false,
        status: null,
        stateClass: '',
        reason: 'Hat is already at target.',
      })
    );
    expect(html).toContain('disabled');
    expect(html).not.toContain('checked');
    expect(html).toContain('Hat is already at target.');
  });
});

test.describe('game screens', () => {
  test('gameCardHtml renders a portrait and name by default', async ({ page }) => {
    const html = await page.evaluate(() => gameCardHtml({ portraitUrl: '/p.png', name: 'Bob' }));
    expect(html).toContain('/p.png');
    expect(html).toContain('Bob');
    expect(html).toContain('game-card-name');
  });

  test('gameCardHtml omits the visible name when showName is false', async ({ page }) => {
    const html = await page.evaluate(() =>
      gameCardHtml({ portraitUrl: '/p.png', name: 'Bob' }, { showName: false })
    );
    expect(html).toContain('/p.png');
    expect(html).not.toContain('game-card-name');
    // The image keeps its alt text for accessibility even with the visible label hidden.
    expect(html).toContain('alt="Bob"');
  });

  test('gameCardDetailModalHtml renders the name, traits, and a close button', async ({ page }) => {
    const html = await page.evaluate(() =>
      gameCardDetailModalHtml({ name: 'Bob', portraitUrl: '/p.png', traitLabels: 'Hat, Beard' })
    );
    expect(html).toContain('Bob');
    expect(html).toContain('/p.png');
    expect(html).toContain('Hat, Beard');
    expect(html).toContain('id="closeGameCardDetailBtn"');
  });

  test('pickScreenHtml names the picking player and warns off the other one', async ({ page }) => {
    const html = await page.evaluate(() => pickScreenHtml(1, 2));
    expect(html).toContain('Player 1: pick your character');
    expect(html).toContain('Player 2');
    expect(html).toContain('id="pickGrid"');
  });

  test('passScreenHtml names the incoming player and includes the given subtitle', async ({ page }) => {
    const html = await page.evaluate(() => passScreenHtml(2, 'get ready to pick'));
    expect(html).toContain('Pass the device to Player 2');
    expect(html).toContain('get ready to pick');
  });

  test('playScreenHtml shows the guess button before a question is asked', async ({ page }) => {
    const html = await page.evaluate(() =>
      playScreenHtml({ player: 1, opponent: 2, remainingCount: 6, turnActionTaken: false })
    );
    expect(html).toContain("Player 1's turn");
    expect(html).toContain('6');
    expect(html).toContain('id="finalGuessBtn"');
    expect(html).not.toContain('endTurnBtn');
  });

  test('playScreenHtml shows the pass-turn button after a question is asked', async ({ page }) => {
    const html = await page.evaluate(() =>
      playScreenHtml({ player: 1, opponent: 2, remainingCount: 3, turnActionTaken: true })
    );
    expect(html).toContain('id="endTurnBtn"');
    expect(html).toContain('Pass to Player 2');
    expect(html).not.toContain('finalGuessBtn');
  });

  test('traitAskButtonHtml shows just the label before it is asked', async ({ page }) => {
    const html = await page.evaluate(() => traitAskButtonHtml({ label: 'Glasses', asked: false, answer: undefined }));
    expect(html).toContain('Glasses');
    expect(html).not.toContain('trait-ask-answer');
  });

  test('traitAskButtonHtml shows Yes/No once answered', async ({ page }) => {
    const yes = await page.evaluate(() => traitAskButtonHtml({ label: 'Glasses', asked: true, answer: true }));
    const no = await page.evaluate(() => traitAskButtonHtml({ label: 'Hat', asked: true, answer: false }));
    expect(yes).toContain('trait-ask-answer-yes');
    expect(yes).toContain('Yes');
    expect(no).toContain('trait-ask-answer-no');
    expect(no).toContain('No');
  });

  test('traitGroupButtonHtml prompts to choose when no option in the group is asked yet', async ({ page }) => {
    const html = await page.evaluate(() =>
      traitGroupButtonHtml({
        label: 'Hair color',
        options: [{ id: 'hair_light', label: 'Light hair' }, { id: 'hair_dark', label: 'Dark hair' }],
        myAnswers: {},
      })
    );
    expect(html).toContain('Hair color');
    expect(html).toContain('Choose');
    expect(html).not.toContain('trait-ask-answer');
  });

  test('traitGroupButtonHtml shows an asked-count summary once some options are answered', async ({ page }) => {
    const html = await page.evaluate(() =>
      traitGroupButtonHtml({
        label: 'Hair',
        options: [
          { id: 'hair_light', label: 'Light hair' },
          { id: 'hair_dark', label: 'Dark hair' },
          { id: 'bald', label: 'Bald' },
        ],
        myAnswers: { hair_light: false },
      })
    );
    expect(html).toContain('Hair');
    expect(html).toContain('1/3 asked');
    expect(html).not.toContain('Choose');
  });

  test('traitGroupModalHtml renders one button per option, disabling already-asked ones', async ({ page }) => {
    const html = await page.evaluate(() =>
      traitGroupModalHtml({
        label: 'Hair color',
        options: [{ id: 'hair_light', label: 'Light hair' }, { id: 'hair_dark', label: 'Dark hair' }],
        myAnswers: { hair_light: true },
      })
    );
    expect(html).toContain('Hair color');
    expect(html).toContain('data-id="hair_light"');
    expect(html).toContain('data-id="hair_dark"');
    expect(html).toMatch(/data-id="hair_light" disabled/);
    expect(html).not.toMatch(/data-id="hair_dark" disabled/);
    expect(html).toContain('id="cancelTraitGroupBtn"');
  });

  test('guessPickerHtml renders the confirm/cancel affordances', async ({ page }) => {
    const html = await page.evaluate(() => guessPickerHtml());
    expect(html).toContain('id="guessGrid"');
    expect(html).toContain('id="confirmGuessBtn"');
    expect(html).toContain('id="cancelGuessBtn"');
  });

  test('gameOverHtml announces the winner and embeds both reveal cards', async ({ page }) => {
    const html = await page.evaluate(() =>
      gameOverHtml({
        winner: 2,
        message: 'Player 2 guessed correctly!',
        winnerCardHtml: '<img alt="Bob">',
        loserCardHtml: '<img alt="Alice">',
      })
    );
    expect(html).toContain('Player 2 wins!');
    expect(html).toContain('Player 2 guessed correctly!');
    expect(html).toContain('alt="Bob"');
    expect(html).toContain('alt="Alice"');
  });
});
