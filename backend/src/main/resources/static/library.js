// Photo Library: board-agnostic photo grid, standalone from any board.

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

// Add photo (FAB): pick a photo (camera or upload), then bounce to the crop step.

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
