// Add-character wizard: FAB (pick a photo) -> crop.js's crop step (or a Photo Library pick,
// which skips crop) -> features step below (pick traits, generate).

// FAB: pick a photo (camera or upload), then bounce to the crop step.

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

// Choose from library: an alternate first step for add-character that forks around crop +
// detectTraits() entirely — the picked photo's features were already detected when it was added
// to the library, so selectLibraryPhoto carries them straight into the features step.

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

// Features step: spinner while Gemini detects traits, then pick features and create.

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
