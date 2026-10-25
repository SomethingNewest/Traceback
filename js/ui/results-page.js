import { activities, activityById } from '../activities/registry.js';
import { baselineForResult } from '../data/baselines.js';
import { comparisonGroups, metricChange, selectTrendResults } from '../data/trends.js';
import {
  REPORT_LIMITATIONS,
  formatValue,
  localDate,
  metricMetadata,
  resultsReportHTML,
} from '../export/report.js';
import { renderTrendChart, renderFrequencyChart } from './charts.js';
import { dateTime, node } from './results-helpers.js';
import { savedResultsTable } from './results-table.js';

export function renderResultsPage(
  container,
  { store, now, download, print, confirmShare = async () => true, earlierResultsCount = 0 },
) {
  const allResults = selectTrendResults(store.results);
  let activityId = allResults.at(-1)?.activityId ?? activities[0].id;
  let comparisonKey;
  let metricKey = 'accuracyPct';
  let timeframe = 'all';
  let printing = false;
  let selectedCount = 0;

  container.innerHTML = `
    <div class="page-intro results-intro">
      <div>
        <h1>Your results</h1>
        <p>See your saved games over time. Choose one game and setup to compare your results.</p>
      </div>
      <a href="#/report" class="button button-outline">Weekly report</a>
    </div>
    <nav class="results-section-nav" aria-label="Results sections">
      <button type="button" class="button button-outline button-small" data-results-jump="results-trend-heading">Trend graph</button>
      <button type="button" class="button button-outline button-small" data-results-jump="results-frequency-heading">Games played</button>
      <button type="button" class="button button-outline button-small" data-results-jump="results-saved-heading">All saved games</button>
    </nav>
    <section id="results-earlier-data" class="card results-earlier-data" aria-labelledby="results-earlier-heading" hidden>
      <div><h2 id="results-earlier-heading">Your earlier results are still here</h2><p id="results-earlier-copy"></p><p>Open Settings and choose Copy older results to use them here. You will be asked before anything is replaced.</p></div>
      <a class="button button-outline" href="#/settings">Find earlier results</a>
    </section>
    <section class="card results-controls" aria-labelledby="results-choices-heading">
      <h2 id="results-choices-heading">Choose what to see</h2>
      <div class="results-filter-grid">
        <div class="field">
          <label for="history-activity">Game</label>
          <select id="history-activity"></select>
        </div>
        <div class="field">
          <label for="results-range">Time range</label>
          <select id="results-range">
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </div>
        <div class="field results-setup-field">
          <label for="results-setup">Setup</label>
          <select id="results-setup" aria-describedby="results-setup-help"></select>
          <small id="results-setup-help">Each setup has its own starting point. Different game versions are kept separate.</small>
        </div>
        <div class="field results-metric-field">
          <label for="results-metric">Measurement</label>
          <select id="results-metric"></select>
        </div>
      </div>
      <div class="report-actions actions">
        <button type="button" class="button" id="print-results">Print / Save as PDF</button>
        <button type="button" class="button button-outline" id="download-results-report">Download report</button>
      </div>
      <p class="muted">Your report includes graphs and results for the game, setup and dates you choose above.</p>
      <p id="history-status" class="form-status" role="status"></p>
    </section>
    <div class="results-summary-grid" aria-label="Selected results summary">
      <section class="card results-stat">
        <h2>Games shown</h2>
        <p id="results-game-count" class="results-stat-value">0</p>
        <p id="results-game-count-copy" class="results-stat-copy"></p>
      </section>
      <section class="card results-stat">
        <h2>Last accuracy</h2>
        <p id="results-last-accuracy" class="results-stat-value"></p>
        <p id="results-last-date" class="results-stat-copy"></p>
      </section>
      <section class="card results-stat">
        <h2 id="results-change-heading">Change from starting point</h2>
        <p id="results-change" class="results-stat-value"></p>
        <p id="results-change-copy" class="results-stat-copy"></p>
      </section>
    </div>
    <section class="card results-trend-card" aria-labelledby="results-trend-heading">
      <div class="results-section-heading">
        <div>
          <h2 id="results-trend-heading">Your trend</h2>
          <p id="results-measure-description" class="muted"></p>
        </div>
        <a class="button button-small" id="results-play-game">Play this game</a>
      </div>
      <p id="results-profile-description" class="results-profile-description"></p>
      <button type="button" class="button button-outline button-small" id="results-show-all" hidden>Show all time</button>
      <div id="results-trend"></div>
      <p class="results-chart-help">A higher or lower number describes this game. It does not show whether a brain injury has healed.</p>
    </section>
    <section class="card results-frequency-card" aria-labelledby="results-frequency-heading">
      <h2 id="results-frequency-heading">Games played</h2>
      <p id="results-frequency-description" class="muted"></p>
      <div id="results-frequency"></div>
    </section>
    <section class="results-saved-section" aria-labelledby="results-saved-heading">
      <div class="results-section-heading">
        <div>
          <h2 id="results-saved-heading">All saved games</h2>
          <p>Every game is listed here, including games outside the choices above.</p>
        </div>
        <a href="#/report">Download a weekly report</a>
      </div>
      <div id="history-results"></div>
    </section>
    <p class="report-note"></p>
  `;

  const $ = (selector) => container.querySelector(selector);
  const gameSelect = $('#history-activity');
  const setupSelect = $('#results-setup');
  const metricSelect = $('#results-metric');

  if (Number.isSafeInteger(earlierResultsCount) && earlierResultsCount > 0) {
    $('#results-earlier-data').hidden = false;
    $('#results-earlier-copy').textContent =
      `${earlierResultsCount} earlier saved ${earlierResultsCount === 1 ? 'game has' : 'games have'} not been copied to this site. They can be used to show your graphs and comparisons.`;
  }
  for (const button of container.querySelectorAll('[data-results-jump]')) {
    button.addEventListener('click', () => {
      const heading = document.getElementById(button.dataset.resultsJump);
      if (!heading || !container.contains(heading)) return;
      heading.tabIndex = -1;
      heading.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
    });
  }

  for (const activity of activities) {
    const option = node('option', activity.name);
    option.value = activity.id;
    gameSelect.append(option);
  }

  gameSelect.value = activityId;
  $('.report-note').textContent =
    `${REPORT_LIMITATIONS} Results stay in this browser unless you download them.`;

  if (allResults.length) {
    $('#history-results').append(
      savedResultsTable(store, allResults, 'All saved games, oldest first'),
    );
  } else {
    const empty = node('section', undefined, 'card history-empty');
    empty.append(
      node('h3', 'No saved games yet'),
      node(
        'p',
        'Finish a game and save it. Your first result becomes your starting point. Your graphs will grow as you play.',
      ),
    );
    const link = node('a', 'Choose a game', 'button');
    link.href = '#/activities';
    empty.append(link);
    $('#history-results').append(empty);
  }

  function rebuildSetups() {
    const groups = comparisonGroups(store.results, activityId);
    if (!groups.some((group) => group.comparisonKey === comparisonKey)) {
      comparisonKey = groups[0]?.comparisonKey;
    }

    setupSelect.replaceChildren();
    if (!groups.length) {
      const option = node('option', 'Play a game to save your first setup');
      option.value = '';
      setupSelect.append(option);
    }

    for (const [index, group] of groups.entries()) {
      const latest = group.results.at(-1);
      const count = group.results.length;
      const countLabel = `${count} ${count === 1 ? 'game' : 'games'}`;
      const option = node('option', `${index + 1}. ${setupLabel(store, latest)} (${countLabel})`);
      option.value = group.comparisonKey;
      setupSelect.append(option);
    }

    setupSelect.disabled = !groups.length;
    setupSelect.value = comparisonKey ?? '';
  }

  function rebuildMetrics() {
    const entries = selectTrendResults(store.results, { activityId, comparisonKey });
    const activity = activityById(activityId);
    const keys = ['accuracyPct'];
    const hasMetric = (key) => entries.some((result) => Object.hasOwn(result.metrics, key));

    if (activity.metricKey !== 'accuracyPct' && hasMetric(activity.metricKey)) {
      keys.push(activity.metricKey);
    }
    if (hasMetric('completionSeconds')) keys.push('completionSeconds');
    if (activityId === 'trace' && hasMetric('coveragePct')) keys.push('coveragePct');
    if (!keys.includes(metricKey)) metricKey = 'accuracyPct';

    metricSelect.replaceChildren();
    const protocolVersion = entries[0]?.protocolVersion ?? activity.protocolVersion;
    for (const key of keys) {
      const metadata = metricMetadata(key, activityId, protocolVersion);
      const option = node('option', metadata.label);
      option.value = key;
      metricSelect.append(option);
    }
    metricSelect.value = metricKey;
  }

  function update() {
    const activity = activityById(activityId);
    const results = selectTrendResults(store.results, {
      activityId,
      comparisonKey,
      timeframe,
      now,
    });
    selectedCount = results.length;
    $('#download-results-report').disabled = !selectedCount;
    $('#print-results').disabled = !selectedCount || printing;

    // Keep the original starting point even when it falls outside the selected dates.
    const fullSeries = selectTrendResults(store.results, { activityId, comparisonKey });
    $('#results-show-all').hidden =
      results.length > 0 || fullSeries.length === 0 || timeframe === 'all';
    const latest = results.at(-1);
    const example = fullSeries[0];
    const possibleBaseline = example ? baselineForResult(store, example) : null;
    const sameSetup = possibleBaseline?.comparisonKey === comparisonKey;
    const sameActivity = possibleBaseline?.activityId === activityId;
    const baseline = sameSetup && sameActivity ? possibleBaseline : null;
    const metadata = metricMetadata(
      metricKey,
      activityId,
      example?.protocolVersion ?? activity.protocolVersion,
    );

    $('#results-game-count').textContent = String(results.length);
    $('#results-game-count-copy').textContent =
      `With this setup · ${timeframe === 'all' ? 'all time' : `last ${timeframe} days`}`;
    $('#results-last-accuracy').textContent = latest
      ? formatValue(latest.metrics.accuracyPct, '%')
      : 'No game yet';
    $('#results-last-date').textContent = latest
      ? `Last game shown · ${dateTime(latest.createdAt)}`
      : 'Try another time range or play a game.';

    const change = metricChange(
      latest?.metrics[metricKey],
      baseline?.metrics[metricKey],
      metadata.unit,
    );
    const sameGame = latest && latest.id === baseline?.id;
    let changeLabel = 'Not available';
    if (sameGame) {
      changeLabel = 'Starting point';
    } else if (change) {
      const sign = change.difference > 0 ? '+' : change.difference < 0 ? '−' : '';
      changeLabel = `${sign}${formatValue(Math.abs(change.difference), change.unit)}`;
    }

    $('#results-change').textContent = changeLabel;
    $('#results-change-copy').textContent = baseline
      ? `${metadata.label} · compared with ${dateTime(baseline.createdAt)}. Higher or lower describes this game only.`
      : 'Save your first game with this setup to set a starting point.';
    $('#results-trend-heading').textContent = `${activity.name} · ${metadata.label.toLowerCase()}`;
    $('#results-measure-description').textContent = metadata.description;
    $('#results-profile-description').textContent = example
      ? `Selected setup: ${setupLabel(store, example)}`
      : 'Your first saved game will set up this graph.';
    $('#results-play-game').href = `#/activity/${activityId}`;
    renderTrendChart($('#results-trend'), { results, metricKey, metadata, baseline });

    const frequencyResults = selectTrendResults(store.results, { activityId, timeframe, now });
    const frequencyCount = frequencyResults.length;
    const frequencyLabel = frequencyCount === 1 ? 'game' : 'games';
    $('#results-frequency-description').textContent =
      `${activity.name} · all setups · ${frequencyCount} saved ${frequencyLabel}. This counts games, not accuracy.`;
    renderFrequencyChart($('#results-frequency'), { results: frequencyResults, timeframe, now });

    const setupCount = comparisonGroups(store.results, activityId).length;
    const setupCountLabel = setupCount === 1 ? 'setup' : 'setups';
    const resultCountLabel = results.length === 1 ? 'game' : 'games';
    $('#history-status').textContent =
      `${results.length} ${resultCountLabel} shown in the trend. ${setupCount} saved ${setupCountLabel} for this game.`;
  }

  function currentReport() {
    return resultsReportHTML(store, { activityId, comparisonKey, timeframe, metricKey, now });
  }

  gameSelect.addEventListener('change', () => {
    activityId = gameSelect.value;
    comparisonKey = undefined;
    metricKey = 'accuracyPct';
    rebuildSetups();
    rebuildMetrics();
    update();
  });

  setupSelect.addEventListener('change', () => {
    comparisonKey = setupSelect.value;
    rebuildMetrics();
    update();
  });

  metricSelect.addEventListener('change', () => {
    metricKey = metricSelect.value;
    update();
  });

  $('#results-range').addEventListener('change', (event) => {
    timeframe = event.target.value;
    update();
  });

  $('#results-show-all').addEventListener('click', () => {
    timeframe = 'all';
    $('#results-range').value = 'all';
    update();
  });

  $('#download-results-report').addEventListener('click', async () => {
    const status = $('#history-status');
    try {
      if (!(await confirmShare({ kind: 'report' })) || !status.isConnected) return;
      download(
        `traceback-results-${activityId}-${localDate(now)}.html`,
        currentReport(),
        'text/html;charset=utf-8',
      );
      $('#history-status').textContent = 'Your report is ready. Check your downloads folder.';
    } catch (error) {
      $('#history-status').textContent = `The download could not be made. ${error.message}`;
    }
  });

  $('#print-results').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (printing) return;
    if (!(await confirmShare({ kind: 'printed report or PDF' })) || !button.isConnected) return;
    const status = $('#history-status');
    printing = true;
    button.disabled = true;
    status.textContent = 'Opening your report. Choose Save as PDF in the print window.';

    try {
      await print(currentReport());
      if (status.isConnected) {
        status.textContent = 'Your report opened for printing. Choose Save as PDF to keep a copy.';
      }
    } catch (error) {
      if (status.isConnected) {
        status.textContent = `The print view could not open. Download the report and print that copy. ${error.message}`;
      }
    } finally {
      printing = false;
      if (button.isConnected) button.disabled = !selectedCount;
    }
  });

  rebuildSetups();
  rebuildMetrics();
  update();
}

function setupLabel(store, result) {
  const context = result.context;
  const device = store.devices.find((item) => item.id === context.deviceId);
  return `${context.hand} hand · ${device?.label ?? 'Unknown device'} · ${context.pointerType} · ${context.surfaceCssWidth} × ${context.surfaceCssHeight} · ${result.config.targetSizeMode} targets · v${result.protocolVersion}${context.assistedInput ? ' · assisted' : ''}`;
}
