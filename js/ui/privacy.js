function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Confirm before downloading or printing a readable copy of personal results. */
export function showShareWarning({ kind = 'report', includeNotes = false } = {}) {
  const description = `This ${String(kind)} is not encrypted. Anyone with the file can read the results.${includeNotes ? ' It also includes your notes.' : ''} Keep it somewhere private.`;
  if (typeof document.createElement('dialog').showModal !== 'function')
    return Promise.resolve(window.confirm(description));
  const previousFocus = document.activeElement;
  return new Promise((resolve) => {
    const dialog = element('dialog', 'privacy-share');
    const title = element('h2', null, 'Create a readable copy?');
    title.id = 'privacy-share-heading';
    const message = element('p', null, description);
    message.id = 'privacy-share-message';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.setAttribute('aria-describedby', message.id);
    const form = element('form', 'actions');
    form.method = 'dialog';
    const cancel = element('button', 'button button-outline', 'Cancel');
    cancel.type = 'submit';
    cancel.value = 'cancel';
    cancel.autofocus = true;
    const proceed = element('button', 'button', 'Continue');
    proceed.type = 'submit';
    proceed.value = 'continue';
    form.append(cancel, proceed);
    dialog.append(title, message, form);
    dialog.addEventListener(
      'close',
      () => {
        const confirmed = dialog.returnValue === 'continue';
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
