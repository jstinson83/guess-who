// Routing: '#/board/<id>' shows the detail view, '.../crop' and '.../features' are the
// add-a-character wizard steps, anything else shows the board list. Loaded last, since its
// initial route() call at the bottom needs every show*View function (defined in the other
// view scripts) to already exist.

async function ensureBoardLoaded(id) {
  if (currentBoard && currentBoard.id === id) return true;
  const res = await fetch(`/api/boards/${id}`);
  const board = await res.json();
  if (!res.ok) return false;
  currentBoard = board;
  return true;
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
