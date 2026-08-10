// Crop step, shared by the board add-character flow and the Photo Library add-photo flow
// (see `pendingCropMode` in state.js and its uses below).

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
    // failed upload leaves the crop screen retryable — see uploadLibraryPhoto in library.js.
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
