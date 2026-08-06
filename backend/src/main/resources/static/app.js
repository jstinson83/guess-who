const boardListView = document.getElementById('boardListView');
const boardDetailView = document.getElementById('boardDetailView');
const boardList = document.getElementById('boardList');
const createBoardStatus = document.getElementById('createBoardStatus');

const boardNameEl = document.getElementById('boardName');
const boardMetaEl = document.getElementById('boardMeta');
const characterGrid = document.getElementById('characterGrid');
const traitsEl = document.getElementById('traits');

const fileInput = document.getElementById('fileInput');
const cropContainer = document.getElementById('cropContainer');
const cropImage = document.getElementById('cropImage');
const personNameInput = document.getElementById('personName');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const resultImg = document.getElementById('resultImg');

let cropper = null;
let currentBoard = null;

// --- Routing: '#/board/<id>' shows the detail view, anything else shows the list. ---

function boardIdFromHash() {
  const match = location.hash.match(/^#\/board\/(.+)$/);
  return match ? match[1] : null;
}

async function route() {
  const id = boardIdFromHash();
  if (id) {
    await showBoardDetail(id);
  } else {
    showBoardList();
  }
}

window.addEventListener('hashchange', route);
route();

// --- Board list ---

async function showBoardList() {
  boardDetailView.classList.add('hidden');
  boardListView.classList.remove('hidden');
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
        <div class="board-card-meta">${escapeHtml(board.category)} · ${board.characterCount}/${board.targetSize} characters</div>
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
  const category = document.getElementById('newBoardCategory').value;
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
      body: JSON.stringify({ name, category, targetSize }),
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

// --- Board detail ---

async function showBoardDetail(id) {
  boardListView.classList.add('hidden');
  boardDetailView.classList.remove('hidden');

  boardNameEl.textContent = 'Loading…';
  boardMetaEl.textContent = '';
  characterGrid.innerHTML = '';
  traitsEl.innerHTML = '';

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
  boardMetaEl.textContent = `${board.category} · ${board.characters.length}/${board.targetSize} characters · ${board.status === 'COMPLETE' ? 'Complete' : 'In progress'}`;

  const completeBtn = document.getElementById('completeBoardBtn');
  completeBtn.disabled = board.status === 'COMPLETE';
  completeBtn.textContent = board.status === 'COMPLETE' ? 'Board complete' : 'Mark board complete';

  const addCharacterPanel = document.getElementById('addCharacterPanel');
  addCharacterPanel.classList.toggle('hidden', board.status === 'COMPLETE');

  renderCharacterGrid();
  renderTraits();
}

function renderCharacterGrid() {
  const characters = currentBoard.characters;
  if (characters.length === 0) {
    characterGrid.innerHTML = '<p class="status">No characters added yet.</p>';
    return;
  }

  characterGrid.innerHTML = '';
  for (const character of characters) {
    const card = document.createElement('div');
    card.className = 'character-card';
    const traitLabels = character.traits
      .map((id) => currentBoard.featureStatuses.find((f) => f.id === id)?.label || id)
      .join(', ');
    card.innerHTML = `
      <img src="${character.portraitDataUrl || ''}" alt="${escapeHtml(character.name)}" />
      <div class="character-card-name">${escapeHtml(character.name || 'Unnamed')}</div>
      <div class="character-card-traits">${escapeHtml(traitLabels || 'No features')}</div>
    `;
    characterGrid.appendChild(card);
  }
}

function renderTraits() {
  traitsEl.innerHTML = '';
  for (const feature of currentBoard.availableFeatures) {
    const label = document.createElement('label');
    label.className = 'switch' + (feature.available ? '' : ' switch-disabled');
    label.title = feature.reason || '';
    label.innerHTML = `
      <input type="checkbox" value="${feature.id}" ${feature.available ? '' : 'disabled'} />
      <span class="switch-track"></span>${escapeHtml(feature.label)}
      ${feature.reason ? `<span class="switch-reason">${escapeHtml(feature.reason)}</span>` : ''}
    `;
    traitsEl.appendChild(label);
  }
}

document.getElementById('completeBoardBtn').addEventListener('click', async () => {
  if (!currentBoard) return;
  const res = await fetch(`/api/boards/${currentBoard.id}/complete`, { method: 'POST' });
  const board = await res.json();
  if (!res.ok) return;
  currentBoard = board;
  renderBoardDetail();
});

// --- Add a character (crop + traits + generate) ---

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  cropImage.src = url;
  cropContainer.style.display = 'block';
  resultImg.style.display = 'none';
  statusEl.textContent = '';
  statusEl.className = 'status';

  if (cropper) cropper.destroy();
  cropImage.onload = () => {
    cropper = new Cropper(cropImage, { aspectRatio: 1, viewMode: 1 });
    generateBtn.disabled = false;
  };
});

generateBtn.addEventListener('click', async () => {
  if (!cropper || !currentBoard) return;

  const traits = Array.from(document.querySelectorAll('#traits input:checked:not(:disabled)')).map((el) => el.value);
  const name = personNameInput.value.trim();

  const canvas = cropper.getCroppedCanvas({ width: 768, height: 768 });
  canvas.toBlob(async (blob) => {
    const form = new FormData();
    form.append('image', blob, 'photo.png');
    form.append('name', name);
    form.append('traits', JSON.stringify(traits));

    generateBtn.disabled = true;
    statusEl.textContent = 'Generating…';
    statusEl.className = 'status';
    resultImg.style.display = 'none';

    try {
      const res = await fetch(`/api/boards/${currentBoard.id}/characters`, { method: 'POST', body: form });
      const board = await res.json();
      if (!res.ok) throw new Error(board.error || 'Request failed');

      currentBoard = board;
      const added = board.characters[board.characters.length - 1];
      resultImg.src = added.portraitDataUrl;
      resultImg.style.display = 'block';
      statusEl.textContent = `Added ${added.name || 'character'} to the board.`;

      personNameInput.value = '';
      fileInput.value = '';
      cropContainer.style.display = 'none';
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
      renderCharacterGrid();
      renderTraits();
      boardMetaEl.textContent = `${currentBoard.category} · ${currentBoard.characters.length}/${currentBoard.targetSize} characters · In progress`;
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'status error';
    } finally {
      generateBtn.disabled = false;
    }
  }, 'image/png');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
