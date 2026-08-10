// Character modal: shown on successful create and on tile click. Dismissing lands back on the
// board detail page (a no-op hash set if already there). Also reused, unchanged, by the Photo
// Library's click-to-modal (see openLibraryPhotoModal in library.js) — currentBoard is null
// while viewing the library, so dismissing there just hides the modal instead of navigating.

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

// Generate-random-board modal: launched from the Photo Library screen. Submitting kicks off
// the board (POST /api/boards/random) and navigates straight to its detail page — the step loop
// that actually fills it in (see runRandomBoardSteps in boards.js) starts there once
// showBoardDetail sees the board come back in GENERATING status.

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
