// Pure `data -> HTML string` functions, kept separate from app.js so the DOM
// wiring/event logic isn't interleaved with markup. Loaded as a plain global
// script (no build step, no modules) before app.js — see index.html.
//
// Deliberately not `<template>`-element cloning: these stay callable as
// plain functions of data, which is the easiest shape to port to a
// component framework later if this app ever outgrows vanilla JS/DOM APIs.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function boardCardHtml(board) {
  return `
    <div class="board-card-name">${escapeHtml(board.name)}</div>
    <div class="board-card-meta">${board.characterCount}/${board.targetSize} characters</div>
    <span class="badge badge-${board.status.toLowerCase()}">${board.status === 'COMPLETE' ? 'Complete' : 'In progress'}</span>
  `;
}

function featureBalancePillHtml(status) {
  return `
    <span>${escapeHtml(status.label)}</span>
    <span class="feature-balance-count">${status.currentYes}/${status.targetYesMin}–${status.targetYesMax}</span>
  `;
}

function characterCardHtml(character, traitLabels) {
  return `
    <img src="${character.portraitUrl || ''}" alt="${escapeHtml(character.name)}" />
    <div class="character-card-name">${escapeHtml(character.name || 'Unnamed')}</div>
    <div class="character-card-traits">${escapeHtml(traitLabels || 'No features')}</div>
  `;
}

function traitSwitchHtml({ feature, shouldCheck, status, stateClass, reason }) {
  return `
    <input type="checkbox" value="${feature.id}" data-exclusive-with="${feature.exclusiveWith.join(',')}" ${feature.available ? '' : 'disabled'} ${shouldCheck ? 'checked' : ''} />
    <span class="switch-track"></span>${escapeHtml(feature.label)}
    ${status ? `<span class="switch-count switch-count-${stateClass}">${status.currentYes}/${status.targetYesMin}–${status.targetYesMax}</span>` : ''}
    ${reason ? `<span class="switch-reason">${escapeHtml(reason)}</span>` : ''}
  `;
}

// --- Pass-and-play game ---

function gameCardHtml(character) {
  return `
    <img src="${character.portraitUrl || ''}" alt="${escapeHtml(character.name)}" />
    <div class="game-card-name">${escapeHtml(character.name || 'Unnamed')}</div>
  `;
}

function pickScreenHtml(player, otherPlayer) {
  return `
    <h1>Player ${player}: pick your character</h1>
    <p class="subtitle">Don't let Player ${otherPlayer} see — this is who they'll have to guess.</p>
    <div class="game-card-grid" id="pickGrid"></div>
    <div class="board-complete-actions">
      <button id="confirmPickBtn" disabled>Confirm pick</button>
    </div>
  `;
}

function passScreenHtml(toPlayer, subtitle) {
  return `
    <div class="pass-screen">
      <h1>Pass the device to Player ${toPlayer}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <button id="passContinueBtn">I'm Player ${toPlayer}, continue</button>
    </div>
  `;
}

function playScreenHtml({ player, opponent, remainingCount, turnActionTaken }) {
  return `
    <div class="game-turn-header">
      <h1>Player ${player}'s turn</h1>
      <div class="counter">
        <div class="counter-label">Remaining</div>
        <div class="counter-value">${remainingCount}</div>
      </div>
    </div>
    <div class="game-card-grid" id="playGrid"></div>
    <div class="question-panel">
      <h2 class="question-panel-title">${turnActionTaken ? 'Question asked' : 'Ask a question'}</h2>
      <div class="trait-ask-grid" id="traitAskGrid"></div>
    </div>
    <div class="board-complete-actions">
      ${turnActionTaken
        ? `<button id="endTurnBtn">Pass to Player ${opponent}</button>`
        : `<button id="finalGuessBtn">Make final guess</button>`}
    </div>
  `;
}

function traitAskButtonHtml({ label, asked, answer }) {
  return asked
    ? `<span>${escapeHtml(label)}</span><span class="trait-ask-answer trait-ask-answer-${answer ? 'yes' : 'no'}">${answer ? 'Yes' : 'No'}</span>`
    : `<span>${escapeHtml(label)}</span>`;
}

function guessPickerHtml() {
  return `
    <div class="modal guess-picker-modal">
      <h2>Who do you think it is?</h2>
      <div class="game-card-grid" id="guessGrid"></div>
      <div class="board-complete-actions">
        <button id="confirmGuessBtn" disabled>Confirm guess</button>
      </div>
      <button class="link-btn" id="cancelGuessBtn">Cancel</button>
    </div>
  `;
}

function gameOverHtml({ winner, message, winnerCardHtml, loserCardHtml }) {
  return `
    <div class="game-over-content">
      <h1>Player ${winner} wins!</h1>
      <p class="subtitle">${escapeHtml(message)}</p>
      <div class="game-over-reveal">
        <div class="game-over-reveal-card">
          <div class="game-card">${winnerCardHtml}</div>
        </div>
        <div class="game-over-reveal-card">
          <div class="game-card">${loserCardHtml}</div>
        </div>
      </div>
      <button id="playAgainBtn">Play again</button>
    </div>
  `;
}
