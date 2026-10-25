// make sure an update didn't change or drop anything that was already saved
export function assertHistoryPreserved(current, next) {
  const lists = ['results', 'baselineSeries'];

  for (const list of lists) {
    const saved = new Map();
    for (const item of next[list]) {
      saved.set(item.id, JSON.stringify(item));
    }

    for (const item of current[list]) {
      if (saved.get(item.id) !== JSON.stringify(item)) {
        throw new Error('Saved history changed during this update. Reload before saving.');
      }
    }
  }
}
