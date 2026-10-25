export function applySettings(settings) {
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  root.dataset.colorScheme = settings.colorScheme ?? 'lavender';
  root.style.setProperty('--text-scale', String(settings.textScale));
  for (const key of ['highContrast', 'comfortableSpacing', 'largeControls', 'reducedMotion'])
    root.dataset[key] = String(settings[key]);
}

export function readInstructions(text, onDone) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en';
  utterance.rate = 0.85;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  speechSynthesis.speak(utterance);
  return true;
}

export function stopReading() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
