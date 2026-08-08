const boardListView = document.getElementById('boardListView');
const boardDetailView = document.getElementById('boardDetailView');
const cropView = document.getElementById('cropView');
const featuresView = document.getElementById('featuresView');
const gameView = document.getElementById('gameView');
const gameContent = document.getElementById('gameContent');
const playBoardBtn = document.getElementById('playBoardBtn');
const boardList = document.getElementById('boardList');
const createBoardStatus = document.getElementById('createBoardStatus');

const boardNameEl = document.getElementById('boardName');
const boardMetaEl = document.getElementById('boardMeta');
const characterGrid = document.getElementById('characterGrid');
const traitsEl = document.getElementById('traits');

const fabContainer = document.getElementById('fabContainer');
const fabMain = document.getElementById('fabMain');
const fabCamera = document.getElementById('fabCamera');
const fabUpload = document.getElementById('fabUpload');
const cameraInput = document.getElementById('cameraInput');
const uploadInput = document.getElementById('uploadInput');

const cropContainer = document.getElementById('cropContainer');
const cropImage = document.getElementById('cropImage');
const confirmCropBtn = document.getElementById('confirmCropBtn');
const cropBackBtn = document.getElementById('cropBackBtn');

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

let cropper = null;
let currentBoard = null;
let detectedTraitIds = [];
// Pass-and-play session state — entirely client-side, keyed to the board it was started for
// (see `startNewGame`/`showGameView`). Lost on refresh; that's fine for a same-room MVP.
let gameState = null;

// Photo picked from the FAB, waiting to be cropped.
let pendingPhotoFile = null;
// Cropped blobs (a small one for trait detection, a larger one for the final generate call),
// produced together when the crop is confirmed so the cropper doesn't need to stay alive
// across the crop -> features page transition.
let pendingDetectBlob = null;
let pendingFullBlob = null;

// --- Routing: '#/board/<id>' shows the detail view, '.../crop' and '.../features' are the
// add-a-character wizard steps, anything else shows the board list. ---

function showOnly(view) {
  for (const v of [boardListView, boardDetailView, cropView, featuresView, gameView]) {
    v.classList.toggle('hidden', v !== view);
  }
}

async function route() {
  characterModal.classList.add('hidden');

  const cropMatch = location.hash.match(/^#\/board\/([^/]+)\/crop$/);
  const featuresMatch = location.hash.match(/^#\/board\/([^/]+)\/features$/);
  const playMatch = location.hash.match(/^#\/board\/([^/]+)\/play$/);
  const detailMatch = location.hash.match(/^#\/board\/([^/]+)$/);

  if (cropMatch) {
    await showCropView(cropMatch[1]);
  } else if (featuresMatch) {
    await showFeaturesView(featuresMatch[1]);
  } else if (playMatch) {
    await showGameView(playMatch[1]);
  } else if (detailMatch) {
    await showBoardDetail(detailMatch[1]);
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
      card.innerHTML = `
        <div class="board-card-name">${escapeHtml(board.name)}</div>
        <div class="board-card-meta">${board.characterCount}/${board.targetSize} characters</div>
        <span class="badge badge-${board.status.toLowerCase()}">${board.status === 'COMPLETE' ? 'Complete' : 'In progress'}</span>
      `;
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
  } catch (err) {
    boardNameEl.textContent = 'Board not found';
    boardMetaEl.textContent = err.message;
  }
}

function renderBoardDetail() {
  const board = currentBoard;
  boardNameEl.textContent = board.name;
  boardMetaEl.textContent = `${board.characters.length}/${board.targetSize} characters · ${board.status === 'COMPLETE' ? 'Complete' : 'In progress'}`;

  const hasEnoughCharacters = board.characters.length >= board.targetSize;
  const isComplete = board.status === 'COMPLETE';
  const completeBtn = document.getElementById('completeBoardBtn');
  completeBtn.classList.toggle('hidden', isComplete);
  completeBtn.disabled = !hasEnoughCharacters;
  completeBtn.title = hasEnoughCharacters
    ? ''
    : `Add ${board.targetSize - board.characters.length} more character(s) to complete the board`;

  playBoardBtn.classList.toggle('hidden', !isComplete);
  playBoardBtn.href = `#/board/${board.id}/play`;

  fabContainer.classList.toggle('hidden', isComplete);

  renderCharacterGrid();
  renderFeatureBalance();
}

// Read-only per-feature counts/targets for the whole board — the same [FeatureStatusDto]
// data the features step uses per-character, just without the availability/selection layer.
function renderFeatureBalance() {
  featureBalanceGrid.innerHTML = '';
  for (const status of currentBoard.featureStatuses) {
    const stateClass = status.state.toLowerCase();
    const pill = document.createElement('div');
    pill.className = `feature-balance-pill feature-balance-${stateClass}`;
    pill.innerHTML = `
      <span>${escapeHtml(status.label)}</span>
      <span class="feature-balance-count">${status.currentYes}/${status.targetYesMin}–${status.targetYesMax}</span>
    `;
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
    card.innerHTML = `
      <img src="${character.portraitUrl || ''}" alt="${escapeHtml(character.name)}" />
      <div class="character-card-name">${escapeHtml(character.name || 'Unnamed')}</div>
      <div class="character-card-traits">${escapeHtml(traitLabels || 'No features')}</div>
    `;
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

function gameCardHtml(character) {
  return `
    <img src="${character.portraitUrl || ''}" alt="${escapeHtml(character.name)}" />
    <div class="game-card-name">${escapeHtml(character.name || 'Unnamed')}</div>
  `;
}

// Setup phase: each player privately picks the character the *other* player will have to
// guess. The pass-device interstitial (see renderPassScreen) is what keeps it private.
function renderPickScreen(player) {
  const otherPlayer = player === 1 ? 2 : 1;
  gameContent.innerHTML = `
    <h1>Player ${player}: pick your character</h1>
    <p class="subtitle">Don't let Player ${otherPlayer} see — this is who they'll have to guess.</p>
    <div class="game-card-grid" id="pickGrid"></div>
    <div class="board-complete-actions">
      <button id="confirmPickBtn" disabled>Confirm pick</button>
    </div>
  `;

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
  gameContent.innerHTML = `
    <div class="pass-screen">
      <h1>Pass the device to Player ${toPlayer}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <button id="passContinueBtn">I'm Player ${toPlayer}, continue</button>
    </div>
  `;
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

  gameContent.innerHTML = `
    <div class="game-turn-header">
      <h1>Player ${player}'s turn</h1>
      <div class="counter">
        <div class="counter-label">Remaining</div>
        <div class="counter-value">${candidateIds.size}</div>
      </div>
    </div>
    <div class="game-card-grid" id="playGrid"></div>
    <div class="question-panel">
      <h2 class="question-panel-title">${gameState.turnActionTaken ? 'Question asked' : 'Ask a question'}</h2>
      <div class="trait-ask-grid" id="traitAskGrid"></div>
    </div>
    <div class="board-complete-actions">
      ${gameState.turnActionTaken
        ? `<button id="endTurnBtn">Pass to Player ${opponent}</button>`
        : `<button id="finalGuessBtn">Make final guess</button>`}
    </div>
  `;

  const playGrid = document.getElementById('playGrid');
  for (const character of currentBoard.characters) {
    const card = document.createElement('div');
    card.className = 'game-card' + (candidateIds.has(character.id) ? '' : ' game-card-facedown');
    card.innerHTML = gameCardHtml(character);
    playGrid.appendChild(card);
  }

  const traitAskGrid = document.getElementById('traitAskGrid');
  for (const feature of currentBoard.featureStatuses) {
    const asked = Object.prototype.hasOwnProperty.call(myAnswers, feature.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'trait-ask-btn';
    btn.dataset.id = feature.id;
    btn.disabled = asked || gameState.turnActionTaken;
    btn.innerHTML = asked
      ? `<span>${escapeHtml(feature.label)}</span><span class="trait-ask-answer trait-ask-answer-${myAnswers[feature.id] ? 'yes' : 'no'}">${myAnswers[feature.id] ? 'Yes' : 'No'}</span>`
      : `<span>${escapeHtml(feature.label)}</span>`;
    traitAskGrid.appendChild(btn);
  }
  traitAskGrid.addEventListener('click', (e) => {
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
  overlay.innerHTML = `
    <div class="modal guess-picker-modal">
      <h2>Who do you think it is?</h2>
      <div class="game-card-grid" id="guessGrid"></div>
      <div class="board-complete-actions">
        <button id="confirmGuessBtn" disabled>Confirm guess</button>
      </div>
      <button class="link-btn" id="cancelGuessBtn">Cancel</button>
    </div>
  `;
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

  gameContent.innerHTML = `
    <div class="game-over-content">
      <h1>Player ${gameState.winner} wins!</h1>
      <p class="subtitle">${escapeHtml(message)}</p>
      <div class="game-over-reveal">
        <div class="game-over-reveal-card">
          <div class="game-card">${gameCardHtml(winnerSecret)}</div>
        </div>
        <div class="game-over-reveal-card">
          <div class="game-card">${gameCardHtml(loserSecret)}</div>
        </div>
      </div>
      <button id="playAgainBtn">Play again</button>
    </div>
  `;
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

function onPhotoChosen(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !currentBoard) return;
  pendingPhotoFile = file;
  location.hash = `#/board/${currentBoard.id}/crop`;
}

cameraInput.addEventListener('change', onPhotoChosen);
uploadInput.addEventListener('change', onPhotoChosen);

// --- Crop step ---

async function showCropView(id) {
  const ok = await ensureBoardLoaded(id);
  if (!ok || !pendingPhotoFile) {
    location.hash = `#/board/${id}`;
    return;
  }
  showOnly(cropView);

  confirmCropBtn.disabled = true;
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
  if (currentBoard) location.hash = `#/board/${currentBoard.id}`;
});

confirmCropBtn.addEventListener('click', () => {
  if (!cropper || !currentBoard) return;
  confirmCropBtn.disabled = true;

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
  if (!ok || !pendingDetectBlob || !pendingFullBlob) {
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

  await autoDetectTraits(pendingDetectBlob);
}

featuresBackBtn.addEventListener('click', () => {
  pendingDetectBlob = null;
  pendingFullBlob = null;
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
    label.innerHTML = `
      <input type="checkbox" value="${feature.id}" data-exclusive-with="${feature.exclusiveWith.join(',')}" ${feature.available ? '' : 'disabled'} ${shouldCheck ? 'checked' : ''} />
      <span class="switch-track"></span>${escapeHtml(feature.label)}
      ${status ? `<span class="switch-count switch-count-${stateClass}">${status.currentYes}/${status.targetYesMin}–${status.targetYesMax}</span>` : ''}
      ${reason ? `<span class="switch-reason">${escapeHtml(reason)}</span>` : ''}
    `;
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
  if (!pendingFullBlob || !currentBoard) return;

  const traits = selectedTraitIds();
  const removeTraits = detectedTraitIds.filter((id) => !traits.includes(id));
  const name = personNameInput.value.trim();

  const form = new FormData();
  form.append('image', pendingFullBlob, 'photo.png');
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
// on the board detail page (a no-op hash set if already there). ---

function showCharacterModal({ title, portraitUrl, subtitle }) {
  characterModalTitle.textContent = title;
  characterModalPortrait.src = portraitUrl || '';
  characterModalPortrait.alt = title;
  characterModalSubtitle.textContent = subtitle;
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
