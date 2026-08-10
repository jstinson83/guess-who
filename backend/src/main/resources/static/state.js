// Shared DOM references, mutable app state, and constants used across the other view scripts
// (boards.js, game.js, characters.js, crop.js, library.js, modals.js, router.js). Loaded first
// (after templates.js) so every other script can rely on these already existing.

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
// (see `startNewGame`/`showGameView` in game.js). Lost on refresh; that's fine for a same-room MVP.
let gameState = null;

// Photo picked from the FAB, waiting to be cropped. Shared by both the board add-character flow
// and the Photo Library add-photo flow — only one crop can be in progress at a time, and
// `pendingCropMode` (see showCropView in crop.js) says which flow the confirmed crop feeds into.
let pendingPhotoFile = null;
let pendingCropMode = 'board';
// Cropped blobs (a small one for trait detection, a larger one for the final generate call),
// produced together when the crop is confirmed so the cropper doesn't need to stay alive
// across the crop -> features page transition. Board flow only — the library flow needs just
// one blob, since the server does its own resizing + detection on upload.
let pendingDetectBlob = null;
let pendingFullBlob = null;
// Set instead of pendingDetectBlob/pendingFullBlob when the add-character flow picked a photo
// from the Photo Library (see selectLibraryPhoto in characters.js) — carries its id and
// already-detected features straight into the features step, skipping crop and a second
// detectTraits() call entirely.
let pendingBankPhoto = null;

// Photo Library state: the current bank's photos, and a cached id -> label map for rendering
// detectedFeatures (which the API only returns as ids) — fetched once from /api/features since
// the pool is fixed data, not per-bank.
let libraryPhotos = [];
let libraryFeatureLabels = null;

// Id of the board a random-generation step loop (see runRandomBoardSteps in boards.js) is
// currently driving, or null if none is running. Guards against starting a second loop for the
// same board (e.g. showBoardDetail firing twice); the loop itself stops on its own once
// `currentBoard` no longer points at this board (navigated away) or leaves GENERATING, so
// there's no separate cancel flag.
let boardGenLoopId = null;

function showOnly(view) {
  for (const v of [boardListView, boardDetailView, boardLibraryPickView, cropView, featuresView, gameView, libraryView]) {
    v.classList.toggle('hidden', v !== view);
  }
}
