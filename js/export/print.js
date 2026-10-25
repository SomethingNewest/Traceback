/** Print a self-contained report, rather than the current page's controls. */
export function printReportDocument(html, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Printing was cancelled.'));
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = 'Printable TraceBack report';
    frame.setAttribute('data-private-report', 'true');
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    // The parent opens printing; the report itself never needs to run scripts.
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;';
    const previousFocus = document.activeElement;
    let loadTimer,
      cleanupTimer,
      removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      clearTimeout(loadTimer);
      clearTimeout(cleanupTimer);
      frame.remove();
      signal?.removeEventListener('abort', abort);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(new Error('Printing was cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    frame.addEventListener(
      'load',
      async () => {
        try {
          const view = frame.contentWindow;
          if (!view?.print)
            throw new Error('Printing is not available. Download the report and open it to print.');
          await frame.contentDocument?.fonts?.ready;
          if (removed) return;
          clearTimeout(loadTimer);
          view.addEventListener('afterprint', cleanup, { once: true });
          cleanupTimer = setTimeout(cleanup, 120000);
          view.print();
          resolve();
        } catch (error) {
          fail(error);
        }
      },
      { once: true },
    );
    frame.srcdoc = html;
    loadTimer = setTimeout(
      () =>
        fail(new Error('The print view could not open. Download the report and print that copy.')),
      15000,
    );
    document.body.append(frame);
  });
}
