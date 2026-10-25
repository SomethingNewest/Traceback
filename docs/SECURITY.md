# Security and privacy

TraceBack is a static browser app. It has no accounts, server database, analytics or automatic results upload. GitHub Pages serves the public website files; saved results stay in the browser unless someone exports or shares them.

## Saved data and access

Results, setup information, notes, routines and settings are stored as readable JSON in `localStorage`. There is no passphrase or encryption at rest. Anyone using the same browser profile, scripts on the same origin, browser extensions with sufficient permissions or a compromised device may access this data.

The current storage key is `traceback:v2:data:<encoded-project-path>`. Separate project keys prevent accidental result mixing. They do not isolate sites that share the same GitHub Pages hostname: another script on that origin may read or modify the stored data. A separate hostname is needed for an origin boundary.

Earlier data under `traceback:v1:data` is not copied automatically. Settings offers an explicit copy action, with confirmation before replacement of current data. Removing the earlier shared copy is a separate action and can affect other versions that use that key. Unreadable stored data is not silently replaced or deleted.

## Downloads, restore and deletion

- JSON backups include the complete saved store, including notes, without a password.
- CSV, HTML, PDF and single-result downloads are also readable copies. The app asks before creating an export. Report notes stay out unless selected, but reports still contain dates, measurements and setup information.
- Restore checks the 4 MB file limit before parsing, validates allowed fields and references, asks before replacement and stops if another tab changed the saved value.
- Invalid data, conflicts and failed storage writes do not replace the previous saved value. A recovery download of unreadable storage preserves its content but is not guaranteed to be a restorable backup.
- Deletion asks for confirmation and removes this project's current browser copy. It cannot remove downloaded files, the separate earlier shared copy or data on other devices. Resetting display settings preserves results.

Browser storage can be cleared or lost. Keep wanted backups private and share readable files only with intended recipients.

## Browser safeguards

- Schema validation allows known fields and checks saved-result, routine and baseline references. Raw pointer samples are used during a game and are not saved in history.
- Writes use the Web Locks API, read current data inside the lock and preserve existing results and starting points. Restore and deletion compare the expected stored value before making a change. Browsers without safe locking do not fall back to an unprotected write; save failures are shown.
- Text is rendered through text properties or escaped before HTML/SVG output. CSV text fields are guarded against spreadsheet formula interpretation.
- The entry page's meta Content Security Policy restricts scripts to the same origin and disables programmatic network connections, embedded objects, workers, form submissions and base-URL changes. Inline styles remain allowed for themes, game geometry and reports. The page disables referrers.
- The embedded print frame permits the parent's print call and print dialog without allowing report scripts, forms or popups. Downloaded standalone HTML has its own local print control.
- Frequency charts limit the number of date buckets to avoid allocating an excessive range. The saved measurements remain available even if a graph cannot display that range.
- Generated backups and reports are covered by Git ignore patterns. These help prevent accidental publication; they do not protect renamed files or remove already published copies.

## Hosting and verification limits

GitHub Pages serves the site over HTTPS. HTTPS protects transport; it does not encrypt saved browser data or downloaded reports. A meta policy cannot supply an HTTP `frame-ancestors` rule, and this static app does not control all hosting security headers.

Automated source checks and tests cover selected validation, injection, scoring, storage, deletion and report cases using synthetic data. They cannot prove that every vulnerability or bug has been found. Native-browser policy enforcement, printing, physical devices and assistive technology need separate testing. The app does not provide clinical validation or a security certification.

## References

- [OWASP browser storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage)
- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [GitHub Pages site addresses](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
