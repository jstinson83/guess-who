// Board list

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

// Board detail (landing page for a board: just the characters + a FAB to add one)

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

// Also used by game.js (the play-screen card detail modal and the pass-and-play grid).
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
