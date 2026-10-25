# TraceBack

TraceBack helps people record game practice, compare sessions and share their results. It includes seven games, results graphs, saved routines, accessibility settings and downloadable reports. Scores describe performance in a game; they do not measure injury severity or recovery.

The website uses HTML, CSS and JavaScript. It has no framework, runtime packages, build step or server database.

## Run locally

Install Node.js 22 or later:

```sh
npm run dev
```

Open [localhost:4173](http://127.0.0.1:4173/). Serve the site over HTTP rather than opening `index.html` directly, because it uses JavaScript modules.

```sh
npm run check
npm test
```

These commands check syntax, local imports, entry assets and automated behavior. They need no package installation. For the optional development formatter:

```sh
npm ci
npm run format:check
```

Automated checks do not replace browser, device, accessibility or print testing.

## Games and results

- Spiral Trace, Target Tap, Drag & Place, Steady Ring, Number Trail, Match Pairs and Shape Pick.
- Practice mode without saved scores, plus measured sessions with accuracy and supporting measurements.
- Results graphs with game, setup, measurement and date filters. Comparisons keep different game setups and scoring versions separate.
- Routines with ordered games and resumable progress.
- Weekly CSV downloads and illustrated HTML reports. **Print / Save as PDF** opens the browser's print window. Report notes are included only when selected.
- Text size, control size, spacing, contrast and color settings, plus a brain injury information center.

## Saved data

Results, notes, routines and settings are saved in this browser without an account or passphrase. They are readable, not encrypted. The app does not upload results or use analytics. Anyone with access to the same browser profile, or scripts on the same website origin, may access the stored data.

Each project path uses a separate storage key to avoid mixing results accidentally. Paths on the same GitHub Pages hostname still share an origin. Moving to this project path does not copy saved results automatically. To move current results from another TraceBack project, download a JSON backup in that project's Settings, then restore it in this project's Settings. Restore replaces this project's saved data after confirmation. **Copy older results** handles only the earlier shared `traceback:v1:data` copy; it does not copy the current path-specific stores used by other projects.

Settings also provides JSON backup, restore and deletion. Backups include the complete saved store, including notes. CSV, HTML and PDF files are readable copies too, so the app asks before creating them. Deleting browser data cannot delete downloaded files or copies on other devices. Browser storage can be cleared or lost; keep any wanted backup somewhere private.

See [Security and privacy](docs/SECURITY.md) for details and [AI contributions](docs/AI_USAGE.md) for the file-level contribution summary.

## Source layout

| Location             | Contents                                              |
| -------------------- | ----------------------------------------------------- |
| `js/activities/`     | Game engines, shared geometry and timing              |
| `js/metrics/`        | Scoring functions                                     |
| `js/data/`           | Validation, storage, comparisons, trends and routines |
| `js/ui/`             | Pages, charts, controls and accessibility settings    |
| `js/export/`         | CSV, report documents and printing                    |
| `styles/`, `assets/` | Layout, themes and SVG artwork                        |
| `scripts/`, `tests/` | Preview server, source checks and automated tests     |

## Publish with GitHub Pages

Repository: [SomethingNewest/TracebackTBI](https://github.com/SomethingNewest/TracebackTBI).

In **Settings → Pages**, choose **Deploy from a branch**, **main**, and **/(root)**. The expected website address is [somethingnewest.github.io/TracebackTBI](https://somethingnewest.github.io/TracebackTBI/).

To preview the project path locally:

```sh
node scripts/serve.mjs --base=/TracebackTBI/
```

Open `http://127.0.0.1:4173/TracebackTBI/`.
