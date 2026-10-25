import { bindSelection } from './extra-protocol.js';
import { scoreSequence } from '../metrics/game-scores.js';

export function mountSequence(scope) {
  const startedAt = scope.now();
  let next = 1;
  let attempts = 0;
  let finished = false;

  scope.status('Select the numbers in order. Start with 1.');
  scope.timer('No time limit');
  scope.feedback('Find 1 - 0 of 6 found');

  bindSelection(scope, '.number-node', function (button) {
    if (finished) return;
    attempts++;

    // wrong number, just remind them which one to find
    if (Number(button.dataset.number) !== next) {
      scope.feedback('Find ' + next + '. Select the numbers in order.');
      return;
    }

    button.disabled = true;
    button.dataset.found = 'true';
    button.setAttribute('aria-label', next + '. Found.');
    next++;

    if (next === 7) {
      finished = true;
      const durationMs = Math.max(1, scope.now() - startedAt);
      const score = scoreSequence({ hits: 6, attempts: attempts, durationMs: durationMs });
      scope.complete({
        metrics: score.metrics,
        quality: score.quality,
        durationMs: durationMs,
        pointerType: scope.pointerType,
      });
    } else {
      scope.status('Now find ' + next + '.');
      scope.feedback('Find ' + next + ' - ' + (next - 1) + ' of 6 found');
    }
  });
}
