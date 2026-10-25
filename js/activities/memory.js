import { bindSelection } from './extra-protocol.js';
import { scoreMemory } from '../metrics/game-scores.js';

export function mountMemory(scope) {
  const startedAt = scope.now();
  let first = null;
  let second = null;
  let hideAt = null;
  let matchedPairs = 0;
  let pairAttempts = 0;
  let finished = false;

  function setRevealed(card, visible) {
    card.dataset.revealed = String(visible);
    if (visible) {
      card.setAttribute('aria-label', card.dataset.shape + '. Card ' + card.dataset.card + '.');
    } else {
      card.setAttribute('aria-label', 'Card ' + card.dataset.card + '. Face down.');
    }
  }

  function progressText() {
    return matchedPairs + ' of 3 pairs found - ' + pairAttempts + ' pair attempts';
  }

  scope.status('Turn over two cards. Find the same shape and word.');
  scope.timer('No time limit');
  scope.feedback('0 of 3 pairs found');

  bindSelection(scope, '.memory-card', function (card) {
    if (finished || hideAt !== null) return;
    if (card === first || card.dataset.matched === 'true') return;

    setRevealed(card, true);

    if (!first) {
      first = card;
      scope.status('Choose one more card.');
      return;
    }

    second = card;
    pairAttempts++;

    if (first.dataset.shape === second.dataset.shape) {
      for (const matched of [first, second]) {
        matched.dataset.matched = 'true';
        matched.disabled = true;
        matched.setAttribute('aria-label', matched.dataset.shape + '. Pair found.');
      }
      first = null;
      second = null;
      matchedPairs++;
      scope.feedback(progressText());

      if (matchedPairs === 3) {
        finished = true;
        const durationMs = Math.max(1, scope.now() - startedAt);
        const score = scoreMemory({
          matchedPairs: matchedPairs,
          pairAttempts: pairAttempts,
          durationMs: durationMs,
        });
        scope.complete({
          metrics: score.metrics,
          quality: score.quality,
          durationMs: durationMs,
          pointerType: scope.pointerType,
        });
      } else {
        scope.status('Pair found. Choose two more cards.');
      }
    } else {
      // leave them face up for a bit so the player can see them
      hideAt = scope.now() + 900;
      scope.status('Different shapes. Look, then try again.');
      scope.feedback(progressText());
    }
  });

  scope.frame(function (time) {
    if (finished || hideAt === null || time < hideAt) return;
    setRevealed(first, false);
    setRevealed(second, false);
    first = null;
    second = null;
    hideAt = null;
    scope.status('Choose two cards. Find a pair.');
  });
}
