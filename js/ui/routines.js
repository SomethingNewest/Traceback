import { activities, activityById } from '../activities/registry.js';
import {
  MAX_ROUTINES,
  MAX_ROUTINE_STEPS,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  endRoutine,
} from '../data/routines.js';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(label, onClick, className = 'button button-outline button-small') {
  const element = node('button', label, className);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

function defaultId() {
  if (!globalThis.crypto?.randomUUID)
    throw new Error('This browser cannot create a routine ID. Try an up-to-date browser.');
  return globalThis.crypto.randomUUID();
}

// onSave receives a pure updater and must return the committed store after a
// successful updateStore call. A rejected write leaves the editor untouched.
// Navigation/game startup belongs to the app's onStart/onResume callbacks.
export function renderRoutinesPage(
  container,
  { store, onSave, onStart, onResume, onStop, createId = defaultId },
) {
  let saved = store;
  let draft = { id: null, title: '', steps: [], revision: null };
  let dirty = false;
  let busy = false;
  let disposed = false;
  container.innerHTML =
    '<div class="page-intro"><h1>Your routines</h1><p>Choose games and put them in the order you want to play.</p></div><div id="routine-session"></div><div class="routines-layout"><section class="card routine-builder" aria-labelledby="routine-editor-heading"><h2 id="routine-editor-heading">Make a routine</h2><p>Add a game more than once if you want to repeat it.</p><form id="routine-form"><div class="field"><label for="routine-name">Routine name</label><input id="routine-name" name="routine-name" type="text" maxlength="80" placeholder="For example, My morning games" required></div><div class="routine-add-row"><div class="field"><label for="routine-game">Game to add</label><select id="routine-game"></select></div><button type="button" id="routine-add" class="button button-outline">Add game</button></div><p id="routine-count" class="muted" aria-live="polite"></p><ol id="routine-steps" class="routine-steps" aria-label="Games in this routine"></ol><p id="routine-steps-empty" class="routine-draft-empty">Choose a game above. Then select Add game.</p><div class="actions routine-editor-actions"><button type="submit" id="routine-save" class="button">Save routine</button><button type="button" id="routine-clear" class="button button-outline">Clear editor</button></div></form></section><section class="routine-library" aria-labelledby="routine-library-heading"><h2 id="routine-library-heading">Saved routines</h2><p class="muted">Your routines stay in this browser.</p><div id="routine-list"></div></section></div><p id="routine-status" class="form-status routine-status" role="status" aria-live="polite"></p>';
  const name = container.querySelector('#routine-name');
  const game = container.querySelector('#routine-game');
  const stepList = container.querySelector('#routine-steps');
  const status = container.querySelector('#routine-status');
  const editorHeading = container.querySelector('#routine-editor-heading');
  for (const activity of activities) {
    const option = node('option', activity.name);
    option.value = activity.id;
    game.append(option);
  }
  const nameOf = (activityId) => activityById(activityId)?.name ?? activityId;
  const setStatus = (message) => {
    if (!disposed) status.textContent = message;
  };

  async function perform(action) {
    if (busy || disposed) return;
    busy = true;
    const controls = [...container.querySelectorAll('button, input, select')].map((element) => [
      element,
      element.disabled,
    ]);
    for (const [element] of controls) element.disabled = true;
    setStatus('One moment…');
    try {
      await action();
    } catch (error) {
      setStatus(`Could not save this change. ${error.message}`);
    } finally {
      busy = false;
      if (disposed) return;
      for (const [element, disabled] of controls)
        if (element.isConnected) element.disabled = disabled;
      const addButton = container.querySelector('#routine-add');
      if (addButton) addButton.disabled = draft.steps.length >= MAX_ROUTINE_STEPS;
    }
  }

  function drawSteps(focusIndex = null, focusAction = null) {
    if (disposed) return;
    name.value = draft.title;
    editorHeading.textContent = draft.id ? 'Edit this routine' : 'Make a routine';
    container.querySelector('#routine-save').textContent = draft.id
      ? 'Save changes'
      : 'Save routine';
    container.querySelector('#routine-count').textContent =
      `${draft.steps.length} of ${MAX_ROUTINE_STEPS} games added`;
    container.querySelector('#routine-steps-empty').hidden = draft.steps.length > 0;
    container.querySelector('#routine-add').disabled = draft.steps.length >= MAX_ROUTINE_STEPS;
    stepList.replaceChildren();
    draft.steps.forEach((activityId, index) => {
      const item = node('li', undefined, 'routine-step');
      const copy = node('div', undefined, 'routine-step-copy');
      copy.append(
        node('span', `Game ${index + 1}`, 'routine-step-number'),
        node('strong', nameOf(activityId)),
      );
      const controls = node('div', undefined, 'routine-step-actions');
      const move = (direction) => {
        if (busy || disposed) return;
        const target = index + direction;
        [draft.steps[index], draft.steps[target]] = [draft.steps[target], draft.steps[index]];
        dirty = true;
        drawSteps(target, direction < 0 ? 'up' : 'down');
        setStatus(
          `${nameOf(activityId)} is now game ${target + 1}. Select Save changes to keep the order.`,
        );
      };
      const up = button('Move up', () => move(-1));
      up.dataset.action = 'up';
      up.disabled = index === 0;
      up.setAttribute('aria-label', `Move game ${index + 1}, ${nameOf(activityId)}, up`);
      const down = button('Move down', () => move(1));
      down.dataset.action = 'down';
      down.disabled = index === draft.steps.length - 1;
      down.setAttribute('aria-label', `Move game ${index + 1}, ${nameOf(activityId)}, down`);
      const remove = button('Remove', () => {
        if (busy || disposed) return;
        draft.steps.splice(index, 1);
        dirty = true;
        drawSteps(Math.min(index, draft.steps.length - 1), 'remove');
        if (!draft.steps.length) game.focus();
        setStatus('Game removed from the editor. Save the routine to keep this change.');
      });
      remove.dataset.action = 'remove';
      remove.setAttribute('aria-label', `Remove game ${index + 1}, ${nameOf(activityId)}`);
      controls.append(up, down, remove);
      item.append(copy, controls);
      stepList.append(item);
    });
    if (focusIndex !== null) {
      const item = stepList.children[focusIndex];
      const preferred = item?.querySelector(`[data-action="${focusAction}"]`);
      (preferred?.disabled ? item?.querySelector('[data-action="remove"]') : preferred)?.focus();
    }
  }

  function resetDraft() {
    if (disposed) return;
    draft = { id: null, title: '', steps: [], revision: null };
    dirty = false;
    drawSteps();
  }
  function canLeaveEditor() {
    if (disposed) return false;
    if (!dirty) return true;
    setStatus(
      'Save your changes or select Clear editor before starting or editing another routine.',
    );
    return false;
  }

  function drawSession() {
    if (disposed) return;
    const area = container.querySelector('#routine-session');
    area.replaceChildren();
    const session = saved.routineSession;
    if (!session) return;
    const panel = node('section', undefined, 'card routine-session');
    panel.setAttribute('aria-label', 'Current routine');
    const copy = node('div');
    copy.append(
      node(
        'span',
        session.status === 'complete' ? 'Routine complete' : 'Continue when you are ready',
        'badge badge-violet',
      ),
      node('h2', session.title),
    );
    if (session.status === 'complete')
      copy.append(
        node('p', `You finished all ${session.steps.length} games. Their results are saved.`),
      );
    else
      copy.append(
        node(
          'p',
          `Next: game ${session.nextIndex + 1} of ${session.steps.length} · ${nameOf(session.steps[session.nextIndex])}`,
        ),
        node('p', 'You can take a break. This routine will be here when you return.', 'muted'),
      );
    const controls = node('div', undefined, 'actions');
    if (session.status !== 'complete')
      controls.append(
        button(
          'Continue routine',
          () => {
            if (canLeaveEditor())
              perform(async () => {
                await onResume();
              });
          },
          'button',
        ),
      );
    controls.append(
      button(session.status === 'complete' ? 'Dismiss' : 'End this routine', () =>
        perform(async () => {
          if (onStop) {
            const next = await onStop(session.id);
            if (disposed) return;
            if (next) saved = next;
            else saved = await onSave((current) => endRoutine(current, { sessionId: session.id }));
          } else saved = await onSave((current) => endRoutine(current, { sessionId: session.id }));
          if (disposed) return;
          drawSession();
          drawLibrary();
          setStatus('Routine closed. Your saved game results are still in Your results.');
        }),
      ),
    );
    panel.append(copy, controls);
    area.append(panel);
  }

  function drawLibrary() {
    if (disposed) return;
    const list = container.querySelector('#routine-list');
    list.replaceChildren();
    if (!saved.routines?.length) {
      const empty = node('section', undefined, 'card routine-library-empty');
      empty.append(
        node('h3', 'No routines yet'),
        node(
          'p',
          'Make a routine with the games you want to play. Save it here, then select Start routine.',
        ),
      );
      list.append(empty);
      return;
    }
    for (const routine of saved.routines) {
      const card = node('article', undefined, 'card routine-card');
      card.append(
        node('h3', routine.title),
        node(
          'p',
          `${routine.steps.length} ${routine.steps.length === 1 ? 'game' : 'games'}`,
          'muted',
        ),
      );
      const summary = node('ol', undefined, 'routine-summary');
      routine.steps.forEach((activityId) => summary.append(node('li', nameOf(activityId))));
      card.append(summary);
      const controls = node('div', undefined, 'actions');
      controls.append(
        button(
          'Start routine',
          () => {
            if (canLeaveEditor())
              perform(async () => {
                await onStart(routine.id);
              });
          },
          'button',
        ),
      );
      controls.append(
        button('Edit', () => {
          if (busy || disposed || !canLeaveEditor()) return;
          draft = {
            id: routine.id,
            title: routine.title,
            steps: [...routine.steps],
            revision: routine.revision,
          };
          dirty = false;
          drawSteps();
          name.focus();
          setStatus('Edit the games or their order. Then select Save changes.');
        }),
      );
      controls.append(
        button('Remove routine', () => {
          if (busy || disposed) return;
          if (draft.id === routine.id && dirty) {
            setStatus('Save your changes or select Clear editor before removing this routine.');
            return;
          }
          perform(async () => {
            saved = await onSave((current) =>
              deleteRoutine(current, routine.id, { expectedRevision: routine.revision }),
            );
            if (disposed) return;
            if (draft.id === routine.id) resetDraft();
            drawLibrary();
            setStatus('Routine removed. Your saved game results are still in Your results.');
          });
        }),
      );
      card.append(controls);
      if (saved.routineSession?.status === 'active')
        card.append(
          node(
            'p',
            'Starting here replaces the routine in progress. Saved results stay in Your results.',
            'routine-replace-note muted',
          ),
        );
      list.append(card);
    }
    if (saved.routines.length >= MAX_ROUTINES)
      list.append(
        node(
          'p',
          `You have ${MAX_ROUTINES} routines. Edit or remove one to make room for another.`,
          'notice',
        ),
      );
  }

  name.addEventListener('input', () => {
    if (!disposed) {
      draft.title = name.value;
      dirty = true;
    }
  });
  container.querySelector('#routine-add').addEventListener('click', () => {
    if (busy || disposed || draft.steps.length >= MAX_ROUTINE_STEPS) return;
    draft.steps.push(game.value);
    dirty = true;
    drawSteps();
    setStatus(`${nameOf(game.value)} added as game ${draft.steps.length}.`);
  });
  container.querySelector('#routine-clear').addEventListener('click', () => {
    if (busy || disposed) return;
    resetDraft();
    name.focus();
    setStatus('Editor cleared. Saved routines have not changed.');
  });
  container.querySelector('#routine-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || disposed) return;
    if (!draft.title.trim()) {
      setStatus('Give your routine a name.');
      name.focus();
      return;
    }
    if (!draft.steps.length) {
      setStatus('Add at least one game before saving.');
      game.focus();
      return;
    }
    perform(async () => {
      const value = { id: draft.id ?? createId(), title: draft.title, steps: [...draft.steps] };
      saved = await onSave((current) =>
        draft.id
          ? updateRoutine(current, draft.id, value, { expectedRevision: draft.revision })
          : createRoutine(current, value),
      );
      if (disposed) return;
      resetDraft();
      drawLibrary();
      setStatus('Routine saved. Select Start routine when you are ready.');
    });
  });
  drawSteps();
  drawSession();
  drawLibrary();
  return {
    hasUnsavedChanges: () => dirty,
    isBusy: () => busy,
    dispose: () => {
      disposed = true;
    },
  };
}
