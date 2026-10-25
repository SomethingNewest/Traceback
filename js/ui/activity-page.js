import { activityById, supportsActivity } from '../activities/registry.js';
import { SPIRAL_POINTS, SPIRAL_GUIDE_WIDTH } from '../activities/protocol.js';
import { activityIllustration } from './pages.js';
import {
  NUMBER_LAYOUT,
  MEMORY_LAYOUT,
  CHOICE_ROUNDS,
  shapeMarkup,
} from '../activities/extra-protocol.js';

export function activityPage(id, settings, capabilities) {
  const activity = activityById(id);
  const supported = supportsActivity(id, capabilities);
  return `<div class="page-intro activity-intro"><p class="back-link"><a href="#/activities">← All games</a></p><h1>${activity.name}</h1><p>${activity.description}</p></div>
  <section id="ready-panel" class="card activity-ready">
    <div class="ready-overview"><div><span class="badge badge-violet">${activity.duration}</span><h2>How to play</h2>${settings.simplifiedInstructions ? `<p class="start-instruction">${activity.practiceInstruction}</p>` : `<ol class="ready-steps">${activity.instructions.map((line) => `<li>${line}</li>`).join('')}</ol>`}<p class="ready-stop">You can stop at any time.</p></div><div class="ready-illustration" data-activity="${id}">${activityIllustration(id)}</div></div>
    <label class="check-row consent-row" id="activity-consent-row"><input id="activity-consent" type="checkbox"><span>Scores describe this game, not recovery.</span></label>
    <div class="actions start-actions"><button id="start-practice" class="button" type="button" ${supported ? '' : 'disabled'}>Start game <span aria-hidden="true">→</span></button><button id="start-unscored" class="button button-outline" type="button" ${supported ? '' : 'disabled'}>Try without saving</button></div>
    <p id="pointer-message" class="notice" ${supported ? 'hidden' : ''}>You need a mouse or trackpad for Steady Ring. <a href="#/activities">Choose another game</a> if you do not have one.</p>
    <p id="setup-summary" class="setup-summary"></p>
    <details id="setup-options"><summary>Change setup</summary><form id="setup-form" class="form-grid">
      <div class="field"><label for="hand">Hand</label><select id="hand" name="hand"><option value="right">Right hand</option><option value="left">Left hand</option><option value="both">Both hands</option><option value="unspecified">Not sure</option></select></div>
      <div class="field"><label for="device-label">Device name</label><input id="device-label" name="deviceLabel" maxlength="80" value="This device" placeholder="This device" aria-describedby="device-help"><small id="device-help">For example: laptop mouse.</small></div>
      <div class="field"><label for="operator">Who is playing?</label><select id="operator" name="operator"><option value="self">Me</option><option value="caregiver">A caregiver</option></select></div>
      <p id="setup-status" class="form-status full-width" role="status">Your setup is remembered in this browser.</p>
    </form></details>
    <details><summary>More help and read aloud</summary><ol class="instruction-list">${activity.instructions.map((line) => `<li>${line}</li>`).join('')}</ol><div class="actions"><button type="button" class="button button-outline button-small" id="read-instructions">Read aloud</button><button type="button" class="button button-outline button-small" id="stop-reading" hidden>Stop reading</button></div><p id="speech-status" class="form-status" role="status"></p></details>
  </section><section id="practice-area" class="practice-panel" hidden></section>`;
}

function taskMarkup(id, largerTargets) {
  if (id === 'trace') {
    const points = SPIRAL_POINTS.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ');
    const start = SPIRAL_POINTS[0],
      end = SPIRAL_POINTS.at(-1);
    return `<svg viewBox="0 0 1000 1000" aria-hidden="true"><polyline class="trace-guide" points="${points}" style="stroke-width:${SPIRAL_GUIDE_WIDTH * 1000}"/><polyline class="trace-centerline" points="${points}"/><g class="trace-ink"></g><circle class="trace-marker" cx="${start.x * 1000}" cy="${start.y * 1000}" r="18"/><g class="trace-label trace-label-start"><rect x="445" y="482" width="88" height="42" rx="8"/><text x="453" y="512">Start</text></g><circle class="trace-marker trace-finish" cx="${end.x * 1000}" cy="${end.y * 1000}" r="18"/><path class="trace-label-leader" d="M920 518V550"/></svg><span class="trace-label" data-trace-end aria-hidden="true">End</span>`;
  }
  if (id === 'sequence')
    return `<div class="number-board" aria-label="Find 1, then 2, up to 6">${NUMBER_LAYOUT.map((number) => `<button type="button" class="number-node" data-number="${number}" tabindex="-1" aria-label="${number}">${number}<span class="number-check" aria-hidden="true">✓</span></button>`).join('')}</div>`;
  if (id === 'memory')
    return `<div class="memory-board">${MEMORY_LAYOUT.map((shape, index) => `<button type="button" class="memory-card" data-card="${index + 1}" data-shape="${shape}" data-revealed="false" data-matched="false" tabindex="-1" aria-label="Card ${index + 1}. Face down."><span class="memory-back" aria-hidden="true">?<small>${index + 1}</small></span><span class="memory-face" aria-hidden="true">${shapeMarkup(shape)}</span></button>`).join('')}</div>`;
  if (id === 'choice') {
    const firstRound = CHOICE_ROUNDS[0];
    return `<div class="choice-board"><div class="shape-example"><p>Find this shape</p><div class="shape-sample" role="img" aria-label="Find the ${firstRound.sample}.">${shapeMarkup(firstRound.sample)}</div></div><div class="shape-options" aria-label="Choose the matching shape">${firstRound.choices.map((shape, index) => `<button type="button" class="shape-choice" data-choice="${index}" data-shape="${shape}" tabindex="-1" aria-label="${shape}">${shapeMarkup(shape)}</button>`).join('')}</div></div>`;
  }
  if (id === 'hold')
    return `<div class="hold-circle" style="width:${largerTargets ? 96 : 64}px;height:${largerTargets ? 96 : 64}px" aria-hidden="true"><span></span></div>`;
  if (id === 'aim')
    return `<div class="drop-zone" style="width:${largerTargets ? 128 : 104}px;height:${largerTargets ? 128 : 104}px" aria-hidden="true"><span>Place<br>here</span></div><div class="drag-tile" style="width:${largerTargets ? 72 : 56}px;height:${largerTargets ? 72 : 56}px" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 5-4 4 4 4M16 11l4 4-4 4M4 9h10M20 15H10"/></svg><span>Drag</span></div>`;
  return `<div class="activity-target" style="width:${largerTargets ? 112 : 80}px;height:${largerTargets ? 112 : 80}px" aria-hidden="true">Tap</div>`;
}

export function practiceMarkup(id, largerTargets, assisted, practice = false) {
  const activity = activityById(id);
  return `<div class="practice-toolbar"><h2 id="practice-heading" tabindex="-1">${activity.name}</h2><span class="badge badge-violet">${practice ? 'Practice · Not saved' : assisted ? 'Caregiver game' : 'Game'}</span></div>
  <p id="practice-status" class="practice-status" role="status"></p>
  <div class="practice-controls"><p id="practice-timer" class="practice-timer"></p><button id="stop-practice" class="button button-outline button-small" type="button">Stop</button></div>
  <div class="practice-surface" data-activity="${id}" data-active="true" data-larger-targets="${Boolean(largerTargets)}" tabindex="0" role="group" aria-label="${activity.name} game area. Press Escape to stop.">${taskMarkup(id, largerTargets)}</div>
  <p id="practice-feedback" class="form-status"></p>
  <button id="finish-practice" class="button finish-button" type="button" hidden>Finish</button>
  <section id="game-result" class="game-result" hidden aria-label="Your game result"></section>
  <p id="save-status" class="form-status" role="status"></p>
  <div id="practice-end-actions" class="actions" hidden><button id="practice-again" class="button" type="button">Play again</button><a class="button button-outline" href="#/activities">Choose another game</a><button id="change-setup" class="button button-quiet" type="button">Change setup</button></div>`;
}
