import { bindSelection, CHOICE_ROUNDS, shapeMarkup } from './extra-protocol.js';
import { scoreChoice } from '../metrics/game-scores.js';

export function mountChoice(scope) {
  const startedAt = scope.now();
  const sample = scope.surface.querySelector('.shape-sample');
  const choices = Array.from(scope.surface.querySelectorAll('.shape-choice'));

  let round = 0;
  let correct = 0;
  let finished = false;

  function showRound() {
    const config = CHOICE_ROUNDS[round];
    sample.innerHTML = shapeMarkup(config.sample);
    sample.setAttribute('aria-label', 'Find the ' + config.sample + '.');

    for (let i = 0; i < choices.length; i++) {
      const button = choices[i];
      const shape = config.choices[i];
      button.innerHTML = shapeMarkup(shape);
      button.dataset.shape = shape;
      button.setAttribute('aria-label', shape);
    }

    scope.status('Find the ' + config.sample + '. Select the same shape below.');
    scope.timer('Round ' + (round + 1) + ' of 10');
  }

  scope.feedback('0 points - 0 of 10 answered');
  showRound();

  bindSelection(scope, '.shape-choice', function (button) {
    if (finished) return;

    const hit = button.dataset.shape === CHOICE_ROUNDS[round].sample;
    if (hit) {
      correct++;
    }
    round++;

    let message = correct * 100 + ' points - ' + round + ' of 10 answered';
    if (hit) {
      message += ' - Match';
    } else {
      message += ' - Different shape';
    }
    scope.feedback(message);

    if (round === 10) {
      finished = true;
      const durationMs = Math.max(1, scope.now() - startedAt);
      const score = scoreChoice({ correct: correct, rounds: round, durationMs: durationMs });
      scope.complete({
        metrics: score.metrics,
        quality: score.quality,
        durationMs: durationMs,
        pointerType: scope.pointerType,
      });
    } else {
      showRound();
    }
  });
}
