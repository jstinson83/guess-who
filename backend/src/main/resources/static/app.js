const boardListView = document.getElementById('boardListView');
const boardDetailView = document.getElementById('boardDetailView');
const boardLibraryPickView = document.getElementById('boardLibraryPickView');
const cropView = document.getElementById('cropView');
const featuresView = document.getElementById('featuresView');
const gameView = document.getElementById('gameView');
const libraryView = document.getElementById('libraryView');
const gameContent = document.getElementById('gameContent');
const playBoardBtn = document.getElementById('playBoardBtn');
const boardList = document.getElementById('boardList');
const createBoardStatus = document.getElementById('createBoardStatus');

const navBoardsLink = document.getElementById('navBoards');
const navLibraryLink = document.getElementById('navLibrary');

const photoBankPanel = document.getElementById('photoBankPanel');
const photoBankOverlay = document.getElementById('photoBankOverlay');
const photoBankGrid = document.getElementById('photoBankGrid');
const libraryStatusEl = document.getElementById('libraryStatus');
const libraryFabContainer = document.getElementById('libraryFabContainer');
const libraryFabMain = document.getElementById('libraryFabMain');
const libraryFabCamera = document.getElementById('libraryFabCamera');
const libraryFabUpload = document.getElementById('libraryFabUpload');
const libraryCameraInput = document.getElementById('libraryCameraInput');
const libraryUploadInput = document.getElementById('libraryUploadInput');

const generateRandomBoardBtn = document.getElementById('generateRandomBoardBtn');
const randomBoardModal = document.getElementById('randomBoardModal');
const randomBoardNameInput = document.getElementById('randomBoardName');
const randomBoardTargetSizeInput = document.getElementById('randomBoardTargetSize');
const randomBoardStatusEl = document.getElementById('randomBoardStatus');
const randomBoardGenerateBtn = document.getElementById('randomBoardGenerateBtn');
const randomBoardCancelBtn = document.getElementById('randomBoardCancelBtn');

const boardNameEl = document.getElementById('boardName');
const boardMetaEl = document.getElementById('boardMeta');
const boardGeneratingBanner = document.getElementById('boardGeneratingBanner');
const boardGenerationNoticeEl = document.getElementById('boardGenerationNotice');
const resumeGenerationBtn = document.getElementById('resumeGenerationBtn');
const characterGrid = document.getElementById('characterGrid');
const traitsEl = document.getElementById('traits');

const fabContainer = document.getElementById('fabContainer');
const fabMain = document.getElementById('fabMain');
const fabCamera = document.getElementById('fabCamera');
const fabUpload = document.getElementById('fabUpload');
const fabLibrary = document.getElementById('fabLibrary');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');

const libraryPickBackBtn = document.getElementById('libraryPickBackBtn');
const libraryPickPanel = document.getElementById('libraryPickPanel');
const libraryPickOverlay = document.getElementById('libraryPickOverlay');
const libraryPickGrid = document.getElementById('libraryPickGrid');
const libraryPickStatus = document.getElementById('libraryPickStatus');

const cropContainer = document.getElementById('cropContainer');
const cropImage = document.getElementById('cropImage');
const confirmCropBtn = document.getElementById('confirmCropBtn');
const cropBackBtn = document.getElementById('cropBackBtn');
const cropStatusEl = document.getElementById('cropStatus');

const personNameInput = document.getElementById('personName');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const addCharacterPanel = document.getElementById('addCharacterPanel');
const addCharacterOverlay = document.getElementById('addCharacterOverlay');
const featuresBackBtn = document.getElementById('featuresBackBtn');
const traitsCountEl = document.getElementById('traitsCount');
const duplicateWarningEl = document.getElementById('duplicateWarning');
const featureBalanceGrid = document.getElementById('featureBalanceGrid');

const characterModal = document.getElementById('characterModal');
const characterModalTitle = document.getElementById('characterModalTitle');
const characterModalPortrait = document.getElementById('characterModalPortrait');
const characterModalSubtitle = document.getElementById('characterModalSubtitle');
const characterModalDismissBtn = document.getElementById('characterModalDismissBtn');
const characterModalDeleteBtn = document.getElementById('characterModalDeleteBtn');

// Bank id is hardcoded to "default" — the only bank that exists today (see .claude/current.md).
const PHOTO_BANK_ID = 'default';

let cropper = null;
let currentBoard = null;
let detectedTraitIds = [];
// Pass-and-play session state — entirely client-side, keyed to the board it was started for
// (see `startNewGame`/`showGameView`). Lost on refresh; that's fine for a same-room MVP.
let gameState = null;

// Photo picked from the FAB, waiting to be cropped. Shared by both the board add-character flow
// and the Photo Library add-photo flow — only one crop can be in progress at a time, and
// `pendingCropMode` (see showCropView) says which flow the confirmed crop feeds into.
let pendingPhotoFile = null;
let pendingCropMode = 'board';
// Cropped blobs (a small one for trait detection, a larger one for the final generate call),
// produced together when the crop is confirmed so the cropper doesn't need to stay alive
// across the crop -> features page transition. Board flow only — the library flow needs just
// one blob, since the server does its own resizing + detection on upload.
let pendingDetectBlob = null;
let pendingFullBlob = null;
// Set instead of pendingDetectBlob/pendingFullBlob when the add-character flow picked a photo
// from the Photo Library (see selectLibraryPhoto) — carries its id and already-detected features
// straight into the features step, skipping crop and a second detectTraits() call entirely.
let pendingBankPhoto = null;

// Photo Library state: the current bank's photos, and a cached id -> label map for rendering
// detectedFeatures (which the API only returns as ids) — fetched once from /api/features since
// the pool is fixed data, not per-bank.
let libraryPhotos = [];
let libraryFeatureLabels = null;

// Id of the board a random-generation step loop (see runRandomBoardSteps) is currently driving,
// or null if none is running. Guards against starting a second loop for the same board (e.g.
// showBoardDetail firing twice); the loop itself stops on its own once `currentBoard` no longer
// points at this board (navigated away) or leaves GENERATING, so there's no separate cancel flag.
let boardGenLoopId = null;

// --- Routing: '#/board/<id>' shows the detail view, '.../crop' and '.../features' are the
// add-a-character wizard steps, anything else shows the board list. ---

function showOnly(view) {
  for (const v of [boardListView, boardDetailView, boardLibraryPickView, cropView, featuresView, gameView, libraryView]) {
    v.classList.toggle('hidden', v !== view);
  }
}

async function route() {
  characterModal.classList.add('hidden');
  randomBoardModal.classList.add('hidden');

  const pickPhotoMatch = location.hash.match(/^#\/board\/([^/]+)\/pick-photo$/);
  const cropMatch = location.hash.match(/^#\/board\/([^/]+)\/crop$/);
  const featuresMatch = location.hash.match(/^#\/board\/([^/]+)\/features$/);
  const playMatch = location.hash.match(/^#\/board\/([^/]+)\/play$/);
  const detailMatch = location.hash.match(/^#\/board\/([^/]+)$/);
  const libraryCropMatch = location.hash.match(/^#\/library\/crop$/);
  const libraryMatch = location.hash.match(/^#\/library$/);

  const inLibrary = Boolean(libraryMatch || libraryCropMatch);
  navBoardsLink.classList.toggle('top-nav-link-active', !inLibrary);
  navLibraryLink.classList.toggle('top-nav-link-active', inLibrary);

  if (pickPhotoMatch) {
    await showBoardLibraryPickView(pickPhotoMatch[1]);
  } else if (cropMatch) {
    await showCropView(cropMatch[1], 'board');
  } else if (featuresMatch) {
    await showFeaturesView(featuresMatch[1]);
  } else if (playMatch) {
    await showGameView(playMatch[1]);
  } else if (detailMatch) {
    await showBoardDetail(detailMatch[1]);
  } else if (libraryCropMatch) {
    await showCropView(null, 'library');
  } else if (libraryMatch) {
    await showLibraryView();
  } else {
    showBoardList();
  }
}

window.addEventListener('hashchange', route);
route();

async function ensureBoardLoaded(id) {
  if (currentBoard && currentBoard.id === id) return true;
  const res = await fetch(`/api/boards/${id}`);
  const board = await res.json();
  if (!res.ok) return false;
  currentBoard = board;
  return true;
}

// --- Board list ---

async function showBoardList() {
  showOnly(boardListView);
  currentBoard = null;

  boardList.innerHTML = '<p class="status">Loading boards…</p>';
  try {
    const res = await fetch('/api/boards');
    const boards = await res.json();
    if (!res.ok) throw new Error(boards.error || 'Failed to load boards');

    if (boards.length === 0) {
      boardList.innerHTML = '<p class="status">No boards yet — create one above.</p>';
      return;
    }

    boardList.innerHTML = '';
    for (const board of boards) {
      const card = document.createElement('a');
      card.className = 'board-card';
      card.href = `#/board/${board.id}`;
      card.innerHTML = boardCardHtml(board);
      boardList.appendChild(card);
    }
  } catch (err) {
    boardList.innerHTML = `<p class="status error">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('createBoardBtn').addEventListener('click', async () => {
  const name = document.getElementById('newBoardName').value.trim();
  const targetSize = parseInt(document.getElementById('newBoardTargetSize').value, 10);

  if (!name) {
    createBoardStatus.textContent = 'Give the board a name first.';
    createBoardStatus.className = 'status error';
    return;
  }

  createBoardStatus.textContent = 'Creating…';
  createBoardStatus.className = 'status';

  try {
    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetSize }),
    });
    const board = await res.json();
    if (!res.ok) throw new Error(board.error || 'Failed to create board');

    document.getElementById('newBoardName').value = '';
    createBoardStatus.textContent = '';
    location.hash = `#/board/${board.id}`;
  } catch (err) {
    createBoardStatus.textContent = err.message;
    createBoardStatus.className = 'status error';
  }
});

document.getElementById('backToListBtn').addEventListener('click', () => {
  location.hash = '';
});

// --- Board detail (landing page for a board: just the characters + a FAB to add one) ---

async function showBoardDetail(id) {
  showOnly(boardDetailView);

  boardNameEl.textContent = 'Loading…';
  boardMetaEl.textContent = '';
  characterGrid.innerHTML = '';

  try {
    const res = await fetch(`/api/boards/${id}`);
    const board = await res.json();
    if (!res.ok) throw new Error(board.error || 'Board not found');
    currentBoard = board;
    renderBoardDetail();
    if (board.status === 'GENERATING') runRandomBoardSteps(id);
  } catch (err) {
    boardNameEl.textContent = 'Board not found';
    boardMetaEl.textContent = err.message;
  }
}

function renderBoardDetail() {
  const board = currentBoard;
  const isGenerating = board.status === 'GENERATING';
  const isComplete = board.status === 'COMPLETE';

  boardNameEl.textContent = board.name;
  boardMetaEl.textContent = `${board.characters.length}/${board.targetSize} characters · ${isComplete ? 'Complete' : isGenerating ? 'Generating…' : 'In progress'}`;

  boardGeneratingBanner.classList.toggle('hidden', !isGenerating);
  if (isGenerating) {
    boardGeneratingBanner.textContent = `🎲 Generating characters — ${board.characters.length}/${board.targetSize} so far. Keep this tab open to keep it moving; reopening the board later picks up where it left off.`;
  }

  boardGenerationNoticeEl.classList.toggle('hidden', !board.generationError);
  boardGenerationNoticeEl.textContent = board.generationError || '';
  resumeGenerationBtn.classList.toggle('hidden', !board.generationError);
  resumeGenerationBtn.disabled = false;

  const hasEnoughCharacters = board.characters.length >= board.targetSize;
  const completeBtn = document.getElementById('completeBoardBtn');
  completeBtn.classList.toggle('hidden', isComplete || isGenerating);
  completeBtn.disabled = !hasEnoughCharacters;
  completeBtn.title = hasEnoughCharacters
    ? ''
    : `Add ${board.targetSize - board.characters.length} more character(s) to complete the board`;

  playBoardBtn.classList.toggle('hidden', !isComplete);
  playBoardBtn.href = `#/board/${board.id}/play`;

  fabContainer.classList.toggle('hidden', isComplete || isGenerating);

  renderCharacterGrid();
  renderFeatureBalance();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Drives a GENERATING board to completion by polling /random/step on a timer. The endpoint
// itself never blocks on Gemini — each call either kicks off one character's worth of work on
// the server's background scope (if nothing's already running there for this board) or finds one
// already in flight and just returns current state either way — so pacing is our job here, not
// the server's; the server-side debounce guard means an extra poll or two never costs a wasted
// Gemini call. The loop stops on its own — no cancel flag needed — once `currentBoard` no longer
// points at this board (the user navigated away) or the board leaves GENERATING (done, or a
// permanent failure, both surfaced via `generationError` once that happens).
const RANDOM_BOARD_POLL_MS = 2000;

async function runRandomBoardSteps(id) {
  if (boardGenLoopId === id) return;
  boardGenLoopId = id;
  try {
    while (currentBoard && currentBoard.id === id && currentBoard.status === 'GENERATING') {
      try {
        const res = await fetch(`/api/boards/${id}/random/step`, { method: 'POST' });
        if (res.ok) {
          const board = await res.json();
          if (currentBoard.id === id) {
            currentBoard = board;
            renderBoardDetail();
          }
        }
      } catch (err) {
        // Transient network error — just try again next tick.
      }
      await sleep(RANDOM_BOARD_POLL_MS);
    }
  } finally {
    if (boardGenLoopId === id) boardGenLoopId = null;
  }
}

// Read-only per-feature counts/targets for the whole board — the same [FeatureStatusDto]
// data the features step uses per-character, just without the availability/selection layer.
function renderFeatureBalance() {
  featureBalanceGrid.innerHTML = '';
  for (const status of currentBoard.featureStatuses) {
    const stateClass = status.state.toLowerCase();
    const pill = document.createElement('div');
    pill.className = `feature-balance-pill feature-balance-${stateClass}`;
    pill.innerHTML = featureBalancePillHtml(status);
    featureBalanceGrid.appendChild(pill);
  }
}

function traitLabelsFor(character) {
  return character.traits
    .map((id) => currentBoard.featureStatuses.find((f) => f.id === id)?.label || id)
    .join(', ');
}

function renderCharacterGrid() {
  const characters = currentBoard.characters;
  characterGrid.classList.toggle('character-grid-empty', characters.length === 0);
  if (characters.length === 0) {
    characterGrid.innerHTML = '<p class="status">No characters added yet.</p>';
    return;
  }

  characterGrid.innerHTML = '';
  for (const character of characters) {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.id = character.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const traitLabels = traitLabelsFor(character);
    card.innerHTML = characterCardHtml(character, traitLabels);
    characterGrid.appendChild(card);
  }
}

// Clicking (or keyboard-activating) a tile reopens the same modal used after creation, with
// the character's name as the title and its traits as the subtitle in place of the "New
// character created!" copy.
function openCharacterDetailFromTile(card) {
  const character = currentBoard.characters.find((c) => c.id === card.dataset.id);
  if (!character) return;
  showCharacterModal({
    title: character.name || 'Unnamed',
    portraitUrl: character.portraitUrl,
    subtitle: traitLabelsFor(character) || 'No features',
  });
}

characterGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.character-card');
  if (card) openCharacterDetailFromTile(card);
});

characterGrid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.character-card');
  if (!card) return;
  e.preventDefault();
  openCharacterDetailFromTile(card);
});

document.getElementById('completeBoardBtn').addEventListener('click', async () => {
  if (!currentBoard) return;
  const res = await fetch(`/api/boards/${currentBoard.id}/complete`, { method: 'POST' });
  const board = await res.json();
  if (!res.ok) return;
  currentBoard = board;
  renderBoardDetail();
});

// A board only ever ends up here (IN_PROGRESS with generationError set) after a random-fill run
// hit a permanent stop — see runOneRandomStep's stopGenerating calls in BoardRoutes.kt. Nothing
// resumes it automatically since the client only polls /random/step while status is GENERATING,
// so this is the only way back in once whatever caused the stop is addressed (more library
// photos, a lower target size, a server-side fix).
resumeGenerationBtn.addEventListener('click', async () => {
  if (!currentBoard) return;
  resumeGenerationBtn.disabled = true;
  const id = currentBoard.id;
  const res = await fetch(`/api/boards/${id}/random/resume`, { method: 'POST' });
  const board = await res.json();
  if (!res.ok) {
    resumeGenerationBtn.disabled = false;
    boardGenerationNoticeEl.textContent = board.error || 'Failed to resume generation';
    return;
  }
  if (currentBoard.id !== id) return;
  currentBoard = board;
  renderBoardDetail();
  runRandomBoardSteps(id);
});

// --- Pass-and-play game ---
//
// Two secrets (one per player) and two independent candidate tracks: each player's turn
// narrows down *the opponent's* secret, based only on that player's own past answers, so
// player 1's board and player 2's board are never the same set of eliminated characters.
// Trait answers are looked up from the opponent's already-known `traits` (no manual honesty
// needed) and the "who could it be" grid is just the full character list filtered by every
// answer given so far — no separate elimination list to keep in sync.
//
// Turn structure is strict: each turn is exactly one action (ask a trait, or make a final
// guess) then pass. A wrong final guess is an immediate loss, matching the physical game.

function startNewGame() {
  gameState = {
    boardId: currentBoard.id,
    phase: 'PICK1', // PICK1 -> PASS_TO_2 -> PICK2 -> PASS_TO_1 -> PLAYING -> GAME_OVER
    secrets: {}, // { 1: characterId, 2: characterId }
    answers: { 1: {}, 2: {} }, // per player: { traitId: boolean }, accumulated as they ask
    turn: 1,
    turnActionTaken: false,
    winner: null,
    correctGuess: null,
    guesser: null,
  };
}

async function showGameView(id) {
  const ok = await ensureBoardLoaded(id);
  if (!ok || currentBoard.status !== 'COMPLETE') {
    location.hash = `#/board/${id}`;
    return;
  }
  showOnly(gameView);
  if (!gameState || gameState.boardId !== currentBoard.id) {
    startNewGame();
  }
  renderGame();
}

document.getElementById('gameBackBtn').addEventListener('click', () => {
  if (currentBoard) location.hash = `#/board/${currentBoard.id}`;
});

function renderGame() {
  switch (gameState.phase) {
    case 'PICK1':
      renderPickScreen(1);
      break;
    case 'PICK2':
      renderPickScreen(2);
      break;
    case 'PASS_TO_2':
    case 'PASS_TO_1':
      renderPassScreen();
      break;
    case 'PLAYING':
      renderPlayScreen();
      break;
    case 'GAME_OVER':
      renderGameOverScreen();
      break;
  }
}

// Setup phase: each player privately picks the character the *other* player will have to
// guess. The pass-device interstitial (see renderPassScreen) is what keeps it private.
function renderPickScreen(player) {
  const otherPlayer = player === 1 ? 2 : 1;
  gameContent.innerHTML = pickScreenHtml(player, otherPlayer);

  const pickGrid = document.getElementById('pickGrid');
  let selectedId = null;
  for (const character of currentBoard.characters) {
    const card = document.createElement('div');
    card.className = 'game-card game-card-pickable';
    card.dataset.id = character.id;
    card.innerHTML = gameCardHtml(character);
    pickGrid.appendChild(card);
  }

  const confirmBtn = document.getElementById('confirmPickBtn');
  pickGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.game-card');
    if (!card) return;
    pickGrid.querySelectorAll('.game-card-selected').forEach((el) => el.classList.remove('game-card-selected'));
    card.classList.add('game-card-selected');
    selectedId = card.dataset.id;
    confirmBtn.disabled = false;
  });

  confirmBtn.addEventListener('click', () => {
    if (!selectedId) return;
    gameState.secrets[player] = selectedId;
    gameState.phase = player === 1 ? 'PASS_TO_2' : 'PASS_TO_1';
    renderGame();
  });
}

function renderPassScreen() {
  const toPlayer = gameState.phase === 'PASS_TO_2' ? 2 : 1;
  const subtitle = gameState.phase === 'PASS_TO_1'
    ? 'Both characters are picked — ready to play.'
    : `Player ${toPlayer}, get ready to pick your character next.`;
  gameContent.innerHTML = passScreenHtml(toPlayer, subtitle);
  document.getElementById('passContinueBtn').addEventListener('click', () => {
    gameState.phase = gameState.phase === 'PASS_TO_2' ? 'PICK2' : 'PLAYING';
    renderGame();
  });
}

// A player's own candidate board: every character consistent with every answer *that player*
// has received so far. Independent of the opponent's board, since the two players' answers
// come from asking about different secrets.
function remainingCandidates(player) {
  const answers = gameState.answers[player];
  return currentBoard.characters.filter((character) =>
    Object.entries(answers).every(([traitId, answer]) => character.traits.includes(traitId) === answer)
  );
}

function renderPlayScreen() {
  const player = gameState.turn;
  const opponent = player === 1 ? 2 : 1;
  const candidateIds = new Set(remainingCandidates(player).map((c) => c.id));
  const myAnswers = gameState.answers[player];

  gameContent.innerHTML = playScreenHtml({
    player,
    opponent,
    remainingCount: candidateIds.size,
    turnActionTaken: gameState.turnActionTaken,
  });

  const playGrid = document.getElementById('playGrid');
  for (const character of currentBoard.characters) {
    const card = document.createElement('div');
    card.className = 'game-card game-card-clickable' + (candidateIds.has(character.id) ? '' : ' game-card-facedown');
    card.dataset.id = character.id;
    card.innerHTML = gameCardHtml(character, { showName: false });
    playGrid.appendChild(card);
  }
  playGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.game-card');
    if (!card) return;
    const character = currentBoard.characters.find((c) => c.id === card.dataset.id);
    if (character) showGameCardDetail(character);
  });

  const traitAskGrid = document.getElementById('traitAskGrid');
  const renderedGroups = new Set();
  for (const feature of currentBoard.featureStatuses) {
    if (feature.groupLabel) {
      if (renderedGroups.has(feature.groupLabel)) continue;
      renderedGroups.add(feature.groupLabel);
      const options = currentBoard.featureStatuses.filter((f) => f.groupLabel === feature.groupLabel);
      const askedCount = options.filter((o) => Object.prototype.hasOwnProperty.call(myAnswers, o.id)).length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trait-ask-btn trait-group-btn';
      btn.dataset.group = feature.groupLabel;
      btn.disabled = gameState.turnActionTaken || askedCount === options.length;
      btn.innerHTML = traitGroupButtonHtml({ label: feature.groupLabel, options, myAnswers });
      traitAskGrid.appendChild(btn);
      continue;
    }
    const asked = Object.prototype.hasOwnProperty.call(myAnswers, feature.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trait-ask-btn';
    btn.dataset.id = feature.id;
    btn.disabled = asked || gameState.turnActionTaken;
    btn.innerHTML = traitAskButtonHtml({ label: feature.label, asked, answer: myAnswers[feature.id] });
    traitAskGrid.appendChild(btn);
  }
  traitAskGrid.addEventListener('click', (e) => {
    const groupBtn = e.target.closest('.trait-group-btn');
    if (groupBtn) {
      if (groupBtn.disabled) return;
      const options = currentBoard.featureStatuses.filter((f) => f.groupLabel === groupBtn.dataset.group);
      showTraitGroupModal(groupBtn.dataset.group, options, myAnswers);
      return;
    }
    const btn = e.target.closest('.trait-ask-btn');
    if (!btn || btn.disabled) return;
    askTrait(btn.dataset.id);
  });

  if (gameState.turnActionTaken) {
    document.getElementById('endTurnBtn').addEventListener('click', endTurn);
  } else {
    document.getElementById('finalGuessBtn').addEventListener('click', () => showGuessPicker(player, opponent));
  }
}

// The main play-screen board hides character names (see gameCardHtml's showName) to read
// more like a physical Guess Who board — tapping a card instead opens this modal with the
// name and full trait list. Not a fairness leak: every character's appearance/traits are
// already visible on the board to both players, only the two secret picks are hidden.
function showGameCardDetail(character) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = gameCardDetailModalHtml({
    name: character.name,
    portraitUrl: character.portraitUrl,
    traitLabels: traitLabelsFor(character),
  });
  document.body.appendChild(overlay);

  overlay.querySelector('#closeGameCardDetailBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Modal for a grouped category button (e.g. "Hair color") in the trait-ask grid — lets a
// player pick which specific option within the group to ask about, instead of every
// mutually-exclusive option cluttering the flat trait-ask grid on a small screen.
function showTraitGroupModal(label, options, myAnswers) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = traitGroupModalHtml({ label, options, myAnswers });
  document.body.appendChild(overlay);

  document.getElementById('traitGroupOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('.trait-ask-btn');
    if (!btn || btn.disabled) return;
    overlay.remove();
    askTrait(btn.dataset.id);
  });
  document.getElementById('cancelTraitGroupBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// The answer comes from the opponent's own stored traits — the app is the honest referee,
// so nobody has to hand over the device or manually judge a question mid-turn.
function askTrait(traitId) {
  const player = gameState.turn;
  const opponent = player === 1 ? 2 : 1;
  const opponentSecret = currentBoard.characters.find((c) => c.id === gameState.secrets[opponent]);
  gameState.answers[player][traitId] = opponentSecret.traits.includes(traitId);
  gameState.turnActionTaken = true;
  renderGame();
}

function endTurn() {
  gameState.turn = gameState.turn === 1 ? 2 : 1;
  gameState.turnActionTaken = false;
  renderGame();
}

// Guessing is a modal overlay on top of the play screen rather than making the main grid
// itself clickable, so browsing the board while deciding what to ask can't be mistaken for
// a final guess.
function showGuessPicker(player, opponent) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = guessPickerHtml();
  document.body.appendChild(overlay);

  const guessGrid = document.getElementById('guessGrid');
  let selectedId = null;
  for (const character of currentBoard.characters) {
    const card = document.createElement('div');
    card.className = 'game-card game-card-pickable';
    card.dataset.id = character.id;
    card.innerHTML = gameCardHtml(character);
    guessGrid.appendChild(card);
  }

  const confirmBtn = document.getElementById('confirmGuessBtn');
  guessGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.game-card');
    if (!card) return;
    guessGrid.querySelectorAll('.game-card-selected').forEach((el) => el.classList.remove('game-card-selected'));
    card.classList.add('game-card-selected');
    selectedId = card.dataset.id;
    confirmBtn.disabled = false;
  });

  confirmBtn.addEventListener('click', () => {
    if (!selectedId) return;
    overlay.remove();
    resolveGuess(player, opponent, selectedId);
  });
  document.getElementById('cancelGuessBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Classic rule, no take-backs: a wrong final guess loses immediately, it doesn't just cost
// the turn.
function resolveGuess(player, opponent, guessedCharacterId) {
  const correct = guessedCharacterId === gameState.secrets[opponent];
  gameState.phase = 'GAME_OVER';
  gameState.winner = correct ? player : opponent;
  gameState.correctGuess = correct;
  gameState.guesser = player;
  renderGame();
}

function renderGameOverScreen() {
  const loser = gameState.winner === 1 ? 2 : 1;
  const winnerSecret = currentBoard.characters.find((c) => c.id === gameState.secrets[gameState.winner]);
  const loserSecret = currentBoard.characters.find((c) => c.id === gameState.secrets[loser]);
  const message = gameState.correctGuess
    ? `Player ${gameState.guesser} guessed correctly!`
    : `Player ${gameState.guesser} guessed wrong — Player ${gameState.winner} wins by default.`;

  gameContent.innerHTML = gameOverHtml({
    winner: gameState.winner,
    message,
    winnerCardHtml: gameCardHtml(winnerSecret),
    loserCardHtml: gameCardHtml(loserSecret),
  });
  document.getElementById('playAgainBtn').addEventListener('click', () => {
    startNewGame();
    renderGame();
  });
}

// --- FAB: pick a photo (camera or upload), then bounce to the crop step ---

fabMain.addEventListener('click', () => {
  fabContainer.classList.toggle('fab-open');
});

fabCamera.addEventListener('click', () => {
  fabContainer.classList.remove('fab-open');
  cameraInput.click();
});

fabUpload.addEventListener('click', () => {
  fabContainer.classList.remove('fab-open');
  uploadInput.click();
});

fabLibrary.addEventListener('click', () => {
  fabContainer.classList.remove('fab-open');
  if (!currentBoard) return;
  location.hash = `#/board/${currentBoard.id}/pick-photo`;
});

function onPhotoChosen(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !currentBoard) return;
  pendingPhotoFile = file;
  pendingBankPhoto = null;
  location.hash = `#/board/${currentBoard.id}/crop`;
}

cameraInput.addEventListener('change', onPhotoChosen);
uploadInput.addEventListener('change', onPhotoChosen);

// --- Choose from library: an alternate first step for add-character that forks around crop +
// detectTraits() entirely — the picked photo's features were already detected when it was added
// to the library, so selectLibraryPhoto carries them straight into the features step. ---

async function showBoardLibraryPickView(id) {
  const ok = await ensureBoardLoaded(id);
  if (!ok) {
    location.hash = `#/board/${id}`;
    return;
  }
  showOnly(boardLibraryPickView);

  libraryPickGrid.innerHTML = '';
  libraryPickStatus.textContent = '';
  libraryPickStatus.className = 'status';
  libraryPickPanel.classList.add('busy');
  libraryPickOverlay.classList.remove('hidden');

  try {
    libraryPhotos = await fetchLibraryPhotos();
    renderLibraryPickGrid(libraryPhotos);
  } catch (err) {
    libraryPickGrid.innerHTML = `<p class="status error">${escapeHtml(err.message)}</p>`;
  } finally {
    libraryPickPanel.classList.remove('busy');
    libraryPickOverlay.classList.add('hidden');
  }
}

function renderLibraryPickGrid(photos) {
  libraryPickGrid.classList.toggle('character-grid-empty', photos.length === 0);
  if (photos.length === 0) {
    libraryPickGrid.innerHTML = '<p class="status">No photos in the library yet — upload one from the Photo Library first.</p>';
    return;
  }

  libraryPickGrid.innerHTML = '';
  for (const photo of photos) {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.id = photo.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.innerHTML = photoBankCardHtml(photo);
    libraryPickGrid.appendChild(card);
  }
}

function selectLibraryPhoto(id) {
  if (!currentBoard) return;
  const photo = libraryPhotos.find((p) => p.id === id);
  if (!photo) return;
  pendingPhotoFile = null;
  pendingDetectBlob = null;
  pendingFullBlob = null;
  pendingBankPhoto = photo;
  location.hash = `#/board/${currentBoard.id}/features`;
}

libraryPickGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.character-card');
  if (card) selectLibraryPhoto(card.dataset.id);
});

libraryPickGrid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.character-card');
  if (!card) return;
  e.preventDefault();
  selectLibraryPhoto(card.dataset.id);
});

libraryPickBackBtn.addEventListener('click', () => {
  if (currentBoard) location.hash = `#/board/${currentBoard.id}`;
});

// --- Crop step ---

async function showCropView(id, mode) {
  pendingCropMode = mode;

  if (mode === 'library') {
    if (!pendingPhotoFile) {
      location.hash = '#/library';
      return;
    }
  } else {
    const ok = await ensureBoardLoaded(id);
    if (!ok || !pendingPhotoFile) {
      location.hash = `#/board/${id}`;
      return;
    }
  }
  showOnly(cropView);

  confirmCropBtn.disabled = true;
  cropStatusEl.textContent = '';
  cropStatusEl.className = 'status';
  cropImage.src = URL.createObjectURL(pendingPhotoFile);

  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  cropImage.onload = () => {
    cropper = new Cropper(cropImage, {
      aspectRatio: 1,
      viewMode: 1,
      ready() {
        confirmCropBtn.disabled = false;
      },
    });
  };
}

cropBackBtn.addEventListener('click', () => {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  pendingPhotoFile = null;
  if (pendingCropMode === 'library') {
    location.hash = '#/library';
  } else if (currentBoard) {
    location.hash = `#/board/${currentBoard.id}`;
  }
});

confirmCropBtn.addEventListener('click', () => {
  if (!cropper) return;
  confirmCropBtn.disabled = true;

  if (pendingCropMode === 'library') {
    // Cropper stays alive (and pendingPhotoFile unset) until the upload actually succeeds, so a
    // failed upload leaves the crop screen retryable — see uploadLibraryPhoto.
    const canvas = cropper.getCroppedCanvas({ width: 1024, height: 1024 });
    canvas.toBlob((blob) => uploadLibraryPhoto(blob), 'image/png');
    return;
  }

  if (!currentBoard) return;
  const detectCanvas = cropper.getCroppedCanvas({ width: 512, height: 512 });
  const fullCanvas = cropper.getCroppedCanvas({ width: 768, height: 768 });
  detectCanvas.toBlob((detectBlob) => {
    fullCanvas.toBlob((fullBlob) => {
      pendingDetectBlob = detectBlob;
      pendingFullBlob = fullBlob;
      pendingPhotoFile = null;
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      location.hash = `#/board/${currentBoard.id}/features`;
    }, 'image/png');
  }, 'image/png');
});

// --- Features step: spinner while Gemini detects traits, then pick features and create ---

async function showFeaturesView(id) {
  const ok = await ensureBoardLoaded(id);
  const usingLibraryPhoto = Boolean(pendingBankPhoto);
  if (!ok || (!usingLibraryPhoto && (!pendingDetectBlob || !pendingFullBlob))) {
    location.hash = `#/board/${id}`;
    return;
  }
  showOnly(featuresView);

  personNameInput.value = '';
  statusEl.textContent = '';
  statusEl.className = 'status';
  detectedTraitIds = [];
  traitsEl.innerHTML = '';
  traitsCountEl.textContent = '';
  duplicateWarningEl.classList.add('hidden');
  generateBtn.disabled = true;

  if (usingLibraryPhoto) {
    // Already detected when the photo was added to the library — no network call, no spinner.
    detectedTraitIds = pendingBankPhoto.detectedFeatures;
    renderTraits();
  } else {
    await autoDetectTraits(pendingDetectBlob);
  }
}

featuresBackBtn.addEventListener('click', () => {
  pendingDetectBlob = null;
  pendingFullBlob = null;
  pendingBankPhoto = null;
  if (currentBoard) location.hash = `#/board/${currentBoard.id}`;
});

// Detection only runs once the user has confirmed and cropped a photo, not on Cropper's
// default initial crop box — analyzing that produced bad results (see git history).
async function autoDetectTraits(blob) {
  if (!currentBoard) return;

  statusEl.textContent = 'Detecting features…';
  statusEl.className = 'status';
  addCharacterPanel.classList.add('busy');
  addCharacterOverlay.classList.remove('hidden');

  const form = new FormData();
  form.append('image', blob, 'photo.png');

  try {
    const res = await fetch(`/api/boards/${currentBoard.id}/characters/detect-traits`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Feature detection failed');

    detectedTraitIds = data.traitIds || [];
    statusEl.textContent = '';
  } catch (err) {
    // Best-effort suggestion only — leave traits for manual selection if detection fails.
    detectedTraitIds = [];
    statusEl.textContent = `Couldn't auto-detect features (${err.message}) — pick them manually below.`;
    statusEl.className = 'status error';
  } finally {
    addCharacterPanel.classList.remove('busy');
    addCharacterOverlay.classList.add('hidden');
    renderTraits();
  }
}

function renderTraits() {
  traitsEl.innerHTML = '';
  // Detection can flag both halves of an exclusive pair (e.g. long/short hair) at once;
  // only auto-check the first one seen so the pair never starts out in a conflicting state.
  const autoChecked = new Set();
  for (const feature of currentBoard.availableFeatures) {
    const detected = detectedTraitIds.includes(feature.id);
    const conflictsWithAutoChecked = feature.exclusiveWith.some((id) => autoChecked.has(id));
    const shouldCheck = feature.available && detected && !conflictsWithAutoChecked;
    if (shouldCheck) autoChecked.add(feature.id);

    let reason = feature.reason || '';
    if (!feature.available && detected) {
      reason = reason ? `${reason} — detected in photo, will be left out` : 'Detected in photo, will be left out';
    }
    const status = currentBoard.featureStatuses.find((f) => f.id === feature.id);
    const stateClass = status ? status.state.toLowerCase() : '';
    const label = document.createElement('label');
    label.className = 'switch' + (feature.available ? '' : ' switch-disabled');
    label.title = reason;
    label.innerHTML = traitSwitchHtml({ feature, shouldCheck, status, stateClass, reason });
    traitsEl.appendChild(label);
  }
  updateTraitsSummary();
}

// Enforces mutually-exclusive traits (e.g. long hair / short hair) at selection time rather
// than rejecting the combination after the fact: checking one half of a pair immediately
// unchecks its partner, so the two can never both be selected at once.
traitsEl.addEventListener('change', (e) => {
  const checkbox = e.target;
  if (checkbox.matches('input[type="checkbox"]') && checkbox.checked) {
    const exclusiveIds = (checkbox.dataset.exclusiveWith || '').split(',').filter(Boolean);
    for (const id of exclusiveIds) {
      const partner = traitsEl.querySelector(`input[value="${id}"]`);
      if (partner) partner.checked = false;
    }
  }
  updateTraitsSummary();
});

function selectedTraitIds() {
  return Array.from(document.querySelectorAll('#traits input:checked:not(:disabled)')).map((el) => el.value);
}

function sameTraitSet(traitsA, traitsB) {
  if (traitsA.length !== traitsB.length) return false;
  const setA = new Set(traitsA);
  return traitsB.every((id) => setA.has(id));
}

// Keeps the create button gated on the min/max trait count and warns (without blocking) if
// the current selection exactly matches an existing character — two characters with identical
// traits can't be told apart in-game, but other untracked features may still make them look
// different, so this is informational only.
function updateTraitsSummary() {
  const selected = selectedTraitIds();
  const { minTraitsPerCharacter: min, maxTraitsPerCharacter: max } = currentBoard;
  const inRange = selected.length >= min && selected.length <= max;
  const hasName = personNameInput.value.trim().length > 0;

  traitsCountEl.textContent = `${selected.length} feature${selected.length === 1 ? '' : 's'} selected (need ${min}–${max})`;
  traitsCountEl.className = 'status' + (inRange ? '' : ' error');

  const duplicateCount = currentBoard.characters.filter((c) => sameTraitSet(c.traits, selected)).length;
  if (duplicateCount > 0) {
    duplicateWarningEl.textContent =
      `${duplicateCount} existing character${duplicateCount === 1 ? '' : 's'} already ${duplicateCount === 1 ? 'has' : 'have'} this exact combination of features.`;
    duplicateWarningEl.classList.remove('hidden');
  } else {
    duplicateWarningEl.classList.add('hidden');
  }

  generateBtn.disabled = !inRange || !hasName;
}

personNameInput.addEventListener('input', updateTraitsSummary);

generateBtn.addEventListener('click', async () => {
  if (!currentBoard || (!pendingFullBlob && !pendingBankPhoto)) return;

  const traits = selectedTraitIds();
  const removeTraits = detectedTraitIds.filter((id) => !traits.includes(id));
  const name = personNameInput.value.trim();

  const form = new FormData();
  if (pendingBankPhoto) {
    form.append('bankId', PHOTO_BANK_ID);
    form.append('bankPhotoId', pendingBankPhoto.id);
  } else {
    form.append('image', pendingFullBlob, 'photo.png');
  }
  form.append('name', name);
  form.append('traits', JSON.stringify(traits));
  form.append('removeTraits', JSON.stringify(removeTraits));

  generateBtn.disabled = true;
  addCharacterPanel.classList.add('busy');
  addCharacterOverlay.classList.remove('hidden');
  statusEl.textContent = 'Generating…';
  statusEl.className = 'status';

  try {
    const res = await fetch(`/api/boards/${currentBoard.id}/characters`, { method: 'POST', body: form });
    const board = await res.json();
    if (!res.ok) throw new Error(board.error || 'Request failed');

    currentBoard = board;
    pendingDetectBlob = null;
    pendingFullBlob = null;
    pendingBankPhoto = null;
    detectedTraitIds = [];
    const newCharacter = board.characters[board.characters.length - 1];
    showCharacterModal({
      title: 'New character created!',
      portraitUrl: newCharacter.portraitUrl,
      subtitle: newCharacter.name || 'Unnamed',
    });
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'status error';
  } finally {
    updateTraitsSummary();
    addCharacterPanel.classList.remove('busy');
    addCharacterOverlay.classList.add('hidden');
  }
});

// --- Character modal: shown on successful create and on tile click. Dismissing lands back
// on the board detail page (a no-op hash set if already there). Also reused, unchanged, by the
// Photo Library's click-to-modal (see openLibraryPhotoModal) — currentBoard is null while
// viewing the library, so dismissing there just hides the modal instead of navigating. ---

function showCharacterModal({ title, portraitUrl, subtitle, onDelete }) {
  characterModalTitle.textContent = title;
  characterModalPortrait.src = portraitUrl || '';
  characterModalPortrait.alt = title;
  characterModalSubtitle.textContent = subtitle;
  characterModalDeleteBtn.classList.toggle('hidden', !onDelete);
  characterModalDeleteBtn.onclick = onDelete || null;
  characterModal.classList.remove('hidden');
}

function dismissCharacterModal() {
  characterModal.classList.add('hidden');
  if (currentBoard) location.hash = `#/board/${currentBoard.id}`;
}

characterModalDismissBtn.addEventListener('click', dismissCharacterModal);
characterModal.addEventListener('click', (e) => {
  if (e.target === characterModal) dismissCharacterModal();
});

// --- Generate-random-board modal: launched from the Photo Library screen. Submitting kicks off
// the board (POST /api/boards/random) and navigates straight to its detail page — the step loop
// that actually fills it in (see runRandomBoardSteps) starts there once showBoardDetail sees the
// board come back in GENERATING status. ---

function showRandomBoardModal() {
  randomBoardNameInput.value = '';
  randomBoardTargetSizeInput.value = '24';
  randomBoardStatusEl.textContent = '';
  randomBoardStatusEl.className = 'status';
  randomBoardModal.classList.remove('hidden');
}

function dismissRandomBoardModal() {
  randomBoardModal.classList.add('hidden');
}

generateRandomBoardBtn.addEventListener('click', showRandomBoardModal);
randomBoardCancelBtn.addEventListener('click', dismissRandomBoardModal);
randomBoardModal.addEventListener('click', (e) => {
  if (e.target === randomBoardModal) dismissRandomBoardModal();
});

randomBoardGenerateBtn.addEventListener('click', async () => {
  const name = randomBoardNameInput.value.trim();
  const targetSize = parseInt(randomBoardTargetSizeInput.value, 10);

  if (!name) {
    randomBoardStatusEl.textContent = 'Give the board a name first.';
    randomBoardStatusEl.className = 'status error';
    return;
  }

  randomBoardStatusEl.textContent = 'Starting…';
  randomBoardStatusEl.className = 'status';
  randomBoardGenerateBtn.disabled = true;

  try {
    const res = await fetch('/api/boards/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetSize }),
    });
    const board = await res.json();
    if (!res.ok) throw new Error(board.error || 'Failed to start random board generation');

    dismissRandomBoardModal();
    location.hash = `#/board/${board.id}`;
  } catch (err) {
    randomBoardStatusEl.textContent = err.message;
    randomBoardStatusEl.className = 'status error';
  } finally {
    randomBoardGenerateBtn.disabled = false;
  }
});

// --- Photo Library: board-agnostic photo grid, standalone from any board. ---

async function fetchLibraryPhotos() {
  const res = await fetch(`/api/photobank/${PHOTO_BANK_ID}/photos`);
  const photos = await res.json();
  if (!res.ok) throw new Error(photos.error || 'Failed to load photo library');
  return photos;
}

async function ensureFeatureLabels() {
  if (libraryFeatureLabels) return libraryFeatureLabels;
  const res = await fetch('/api/features');
  const features = await res.json();
  libraryFeatureLabels = new Map(features.map((f) => [f.id, f.label]));
  return libraryFeatureLabels;
}

async function showLibraryView() {
  showOnly(libraryView);
  currentBoard = null;

  photoBankGrid.innerHTML = '';
  libraryStatusEl.textContent = '';
  libraryStatusEl.className = 'status';
  photoBankPanel.classList.add('busy');
  photoBankOverlay.classList.remove('hidden');

  try {
    await ensureFeatureLabels();
    libraryPhotos = await fetchLibraryPhotos();
    renderLibraryGrid();
  } catch (err) {
    photoBankGrid.innerHTML = `<p class="status error">${escapeHtml(err.message)}</p>`;
  } finally {
    photoBankPanel.classList.remove('busy');
    photoBankOverlay.classList.add('hidden');
  }
}

function renderLibraryGrid() {
  photoBankGrid.classList.toggle('character-grid-empty', libraryPhotos.length === 0);
  if (libraryPhotos.length === 0) {
    photoBankGrid.innerHTML = '<p class="status">No photos yet — add one below.</p>';
    return;
  }

  photoBankGrid.innerHTML = '';
  for (const photo of libraryPhotos) {
    const card = document.createElement('div');
    card.className = 'character-card';
    card.dataset.id = photo.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.innerHTML = photoBankCardHtml(photo);
    photoBankGrid.appendChild(card);
  }
}

function openLibraryPhotoModal(id) {
  const photo = libraryPhotos.find((p) => p.id === id);
  if (!photo) return;
  const labels = photo.detectedFeatures.map((fid) => libraryFeatureLabels.get(fid) || fid);
  showCharacterModal({
    title: 'Library photo',
    portraitUrl: photo.imageUrl,
    subtitle: labels.length ? labels.join(', ') : 'No features detected',
    onDelete: () => deleteLibraryPhoto(photo.id),
  });
}

photoBankGrid.addEventListener('click', (e) => {
  const card = e.target.closest('.character-card');
  if (card) openLibraryPhotoModal(card.dataset.id);
});

photoBankGrid.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.character-card');
  if (!card) return;
  e.preventDefault();
  openLibraryPhotoModal(card.dataset.id);
});

async function deleteLibraryPhoto(id) {
  if (!confirm('Delete this photo from the library? Characters already created from it keep their own portrait and traits.')) return;

  characterModal.classList.add('hidden');
  photoBankPanel.classList.add('busy');
  photoBankOverlay.classList.remove('hidden');

  try {
    const res = await fetch(`/api/photobank/${PHOTO_BANK_ID}/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete photo');
    libraryPhotos = libraryPhotos.filter((p) => p.id !== id);
    renderLibraryGrid();
  } catch (err) {
    libraryStatusEl.textContent = err.message;
    libraryStatusEl.className = 'status error';
  } finally {
    photoBankPanel.classList.remove('busy');
    photoBankOverlay.classList.add('hidden');
  }
}

// --- Add photo (FAB): pick a photo (camera or upload), then bounce to the crop step. ---

libraryFabMain.addEventListener('click', () => {
  libraryFabContainer.classList.toggle('fab-open');
});

libraryFabCamera.addEventListener('click', () => {
  libraryFabContainer.classList.remove('fab-open');
  libraryCameraInput.click();
});

libraryFabUpload.addEventListener('click', () => {
  libraryFabContainer.classList.remove('fab-open');
  libraryUploadInput.click();
});

function onLibraryPhotoChosen(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  pendingPhotoFile = file;
  location.hash = '#/library/crop';
}

libraryCameraInput.addEventListener('change', onLibraryPhotoChosen);
libraryUploadInput.addEventListener('change', onLibraryPhotoChosen);

// Uploads the confirmed crop — the server resizes it and runs detectTraits() itself, so unlike
// the board flow there's no separate features step. Stays on the crop screen for the (Gemini-
// backed, so not instant) duration of the call, only navigating to the library on success — a
// failure leaves the user able to retry or cancel, rather than racing a hash change against the
// upload like a "navigate first, upload after" version of this would.
async function uploadLibraryPhoto(blob) {
  cropStatusEl.textContent = 'Uploading and detecting features…';
  cropStatusEl.className = 'status';

  const form = new FormData();
  form.append('image', blob, 'photo.png');

  try {
    const res = await fetch(`/api/photobank/${PHOTO_BANK_ID}/photos`, { method: 'POST', body: form });
    const photo = await res.json();
    if (!res.ok) throw new Error(photo.error || 'Upload failed');
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    pendingPhotoFile = null;
    location.hash = '#/library';
  } catch (err) {
    cropStatusEl.textContent = err.message;
    cropStatusEl.className = 'status error';
    confirmCropBtn.disabled = false;
  }
}
