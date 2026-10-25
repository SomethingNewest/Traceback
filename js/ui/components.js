// Only trusted, application-authored markup may use templates. User values go
// through textContent, .value or DOM properties in the page bindings.
const shapes = {
  trace: '<path d="M21 20c-4-5-10-1-8 4s11 5 15-1 0-15-9-15S3 17 5 25s11 13 22 9"/>',
  tap: '<circle cx="20" cy="20" r="15"/><circle cx="20" cy="20" r="7"/><path d="M20 1v5m0 28v5M1 20h5m28 0h5"/>',
  aim: '<circle cx="12" cy="28" r="6"/><circle cx="29" cy="11" r="7"/><path d="m17 23 7-7m-5 0h5v5"/>',
  hold: '<circle cx="20" cy="20" r="16"/><path d="m17 11 0 17 5-5 6-1Z"/>',
};
export function icon(id, className = '') {
  return `<svg class="${className}" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id] ?? shapes.tap}</svg>`;
}

export function confirmDialog({ title, message, action = 'Continue' }) {
  const previousFocus = document.activeElement;
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    dialog.setAttribute('aria-describedby', 'dialog-message');
    dialog.innerHTML =
      '<h2 id="dialog-title"></h2><p id="dialog-message"></p><form method="dialog" class="actions"><button class="button button-outline" value="cancel" autofocus>Cancel</button><button class="button" value="confirm"></button></form>';
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('p').textContent = message;
    dialog.querySelector('[value="confirm"]').textContent = action;
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const first = dialog.querySelector('[value="cancel"]');
      const last = dialog.querySelector('[value="confirm"]');
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener(
      'close',
      () => {
        const confirmed = dialog.returnValue === 'confirm';
        dialog.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(confirmed);
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}
