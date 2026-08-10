// Pass-and-play game
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
