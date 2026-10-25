// fixed layouts so every saved run uses the same setup
export const NUMBER_LAYOUT = Object.freeze([3, 1, 5, 2, 6, 4]);
export const MEMORY_LAYOUT = Object.freeze([
  'circle',
  'square',
  'triangle',
  'square',
  'triangle',
  'circle',
]);
export const SHAPES = Object.freeze(['circle', 'square', 'triangle']);

function choiceRound(sample, choices) {
  return Object.freeze({ sample: sample, choices: Object.freeze(choices) });
}

export const CHOICE_ROUNDS = Object.freeze([
  choiceRound('circle', ['square', 'circle', 'triangle']),
  choiceRound('triangle', ['triangle', 'square', 'circle']),
  choiceRound('square', ['circle', 'triangle', 'square']),
  choiceRound('circle', ['circle', 'triangle', 'square']),
  choiceRound('square', ['triangle', 'square', 'circle']),
  choiceRound('triangle', ['square', 'circle', 'triangle']),
  choiceRound('square', ['square', 'circle', 'triangle']),
  choiceRound('circle', ['triangle', 'square', 'circle']),
  choiceRound('triangle', ['circle', 'triangle', 'square']),
  choiceRound('circle', ['square', 'circle', 'triangle']),
]);

const SHAPE_PATHS = {
  circle: '<circle cx="32" cy="32" r="22"/>',
  square: '<rect x="11" y="11" width="42" height="42" rx="5"/>',
  triangle: '<path d="M32 8 57 54H7Z"/>',
};

export function shapeMarkup(shape) {
  if (!Object.hasOwn(SHAPE_PATHS, shape)) {
    throw new Error('Unknown shape.');
  }
  const word = shape.charAt(0).toUpperCase() + shape.slice(1);
  let html =
    '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" aria-hidden="true">';
  html += SHAPE_PATHS[shape];
  html += '</svg>';
  html += '<span class="shape-word">' + word + '</span>';
  return html;
}

export function bindInputReset(scope, reset) {
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', reset, { signal: scope.signal });
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener(
      'visibilitychange',
      function () {
        if (document.hidden) reset();
      },
      { signal: scope.signal },
    );
  }
}

// only one primary pointer at a time, and holding it down can't select twice
export function bindSelection(scope, selector, select) {
  const activePointers = new Set();

  function onDown(event) {
    if (event.isPrimary !== true || event.button !== 0) return;
    if (event.pointerType !== scope.pointerType) return;
    if (activePointers.size > 0) return;

    const button = event.target.closest ? event.target.closest(selector) : undefined;
    if (!button || button.disabled || scope.signal.aborted) return;

    event.preventDefault();
    activePointers.add(event.pointerId);
    select(button);
  }

  function onUp(event) {
    activePointers.delete(event.pointerId);
  }

  scope.surface.addEventListener('pointerdown', onDown, { signal: scope.signal });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    scope.surface.addEventListener(event, onUp, { signal: scope.signal });
  }
  scope.surface.addEventListener(
    'pointermove',
    function (event) {
      if (['mouse', 'pen'].includes(event.pointerType) && event.buttons === 0) onUp(event);
    },
    { signal: scope.signal },
  );
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerup', onUp, { signal: scope.signal });
    window.addEventListener('pointercancel', onUp, { signal: scope.signal });
  }
  bindInputReset(scope, () => activePointers.clear());
  scope.signal.addEventListener(
    'abort',
    function () {
      activePointers.clear();
    },
    { once: true },
  );
}
