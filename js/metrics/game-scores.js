function checkCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1e9) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function toSeconds(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86400000) {
    throw new Error('Invalid game duration.');
  }
  return durationMs / 1000;
}

function percent(part, total) {
  if (!total) {
    return null;
  }
  return (part / total) * 100;
}

export function scoreSequence({ hits, attempts, durationMs }) {
  checkCount(hits, 'number count');
  checkCount(attempts, 'attempt count');
  if (hits > 6 || attempts < hits) {
    throw new Error('Invalid number trail totals.');
  }

  return {
    metrics: {
      accuracyPct: percent(hits, attempts),
      hitCount: hits,
      missCount: attempts - hits,
      completionSeconds: toSeconds(durationMs),
    },
    quality: { issues: [] },
    validity: { valid: hits === 6 },
  };
}

export function scoreMemory({ matchedPairs, pairAttempts, durationMs }) {
  checkCount(matchedPairs, 'matched pair count');
  checkCount(pairAttempts, 'pair attempt count');
  if (matchedPairs > 3 || pairAttempts < matchedPairs) {
    throw new Error('Invalid match pairs totals.');
  }

  return {
    metrics: {
      accuracyPct: percent(matchedPairs, pairAttempts),
      matchedPairs: matchedPairs,
      pairAttempts: pairAttempts,
      completionSeconds: toSeconds(durationMs),
    },
    quality: { issues: [] },
    validity: { valid: matchedPairs === 3 },
  };
}

export function scoreChoice({ correct, rounds, durationMs }) {
  checkCount(correct, 'correct choice count');
  checkCount(rounds, 'round count');
  if (rounds > 10 || correct > rounds) {
    throw new Error('Invalid shape pick totals.');
  }

  return {
    metrics: {
      accuracyPct: percent(correct, rounds),
      scorePoints: correct * 100,
      hitCount: correct,
      missCount: rounds - correct,
      completionSeconds: toSeconds(durationMs),
    },
    quality: { issues: [] },
    validity: { valid: rounds === 10 },
  };
}
