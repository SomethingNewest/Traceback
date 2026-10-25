import { REPORT_STYLE } from './report-style.js';
import { renderReportFrequencySVG, renderReportTrendSVG } from './report-charts.js';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const number = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const valueLabel = (value, unit = '') =>
  Number.isFinite(value)
    ? `${number(value)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`
    : 'Not recorded';
const dateLabel = (value) =>
  Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not recorded';
const shortDate = (value) =>
  Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Not recorded';

function changeLabel(value, baselineValue, unit, isStartingPoint = false) {
  if (isStartingPoint) return 'Starting point';
  if (!Number.isFinite(value) || !Number.isFinite(baselineValue))
    return 'Not enough data to compare';
  const difference = value - baselineValue;
  if (Math.abs(difference) < 1e-9) return 'Same as starting point';
  return `${valueLabel(Math.abs(difference), unit === '%' ? 'percentage points' : unit)} ${difference > 0 ? 'higher' : 'lower'}`;
}

function setupLabel(group) {
  const context = group.context ?? group.first?.context ?? {},
    config = group.config ?? group.first?.config ?? {};
  const assistiveMode =
    context.assistiveInputMode && context.assistiveInputMode !== 'none'
      ? ` · ${context.assistiveInputMode}`
      : '';
  return `${context.hand ?? 'Unknown'} hand · ${group.deviceLabel ?? 'Unknown device'} · ${context.pointerType ?? 'Unknown input'} · ${context.surfaceCssWidth ?? '?'} × ${context.surfaceCssHeight ?? '?'} CSS px · ${config.targetSizeMode ?? 'Unknown'} targets${assistiveMode}`;
}

function helpLabel(group) {
  const contexts = group.results?.map((result) => result.context ?? {}) ?? [
    group.context ?? group.first?.context ?? {},
  ];
  const inputHelp = contexts.filter(
    (context) => context.assistedInput || context.caregiverProvidedInput,
  ).length;
  const setupHelp = contexts.filter((context) => context.caregiverSetupHelp).length;
  const labels = [];
  if (inputHelp) labels.push(`Help moving or clicking in ${inputHelp} of ${contexts.length} games`);
  if (setupHelp) labels.push(`Help with setup in ${setupHelp} of ${contexts.length} games`);
  return labels.length ? labels.join(' · ') : 'No input or setup help recorded';
}

function metricCards(group) {
  const selected = group.metrics ?? [];
  const latest = group.latest ?? group.results?.at(-1),
    baseline = group.baseline;
  return `<div class="report-group-metrics">${selected
    .slice(0, 2)
    .map(
      (metric) =>
        `<section class="report-metric-card"><h3>Latest ${escape(metric.label.toLowerCase())}</h3><p class="report-metric-value">${escape(valueLabel(latest?.metrics?.[metric.key], metric.unit))}</p><p class="report-metric-change">${escape(changeLabel(latest?.metrics?.[metric.key], baseline?.metrics?.[metric.key], metric.unit, latest?.id === baseline?.id))}</p><p class="report-metric-baseline">Starting point: ${escape(valueLabel(baseline?.metrics?.[metric.key], metric.unit))}${baseline ? ` · ${escape(shortDate(baseline.createdAt))}` : ' · unavailable'}</p></section>`,
    )
    .join('')}</div>`;
}

function charts(group, groupIndex) {
  return (group.metrics ?? [])
    .map((metric, index) => {
      const hasBaseline = Number.isFinite(group.baseline?.metrics?.[metric.key]);
      const count = group.results.filter((result) =>
        Number.isFinite(result.metrics?.[metric.key]),
      ).length;
      const caption =
        `${count === 1 ? 'One measurement is shown. More games are needed for a trend.' : count === 0 ? 'This measurement was not recorded.' : ''}${!hasBaseline ? ' Starting point not recorded for this measurement.' : ''}`.trim();
      return `<figure class="report-chart" aria-labelledby="report-chart-${groupIndex}-${index}"><h3 id="report-chart-${groupIndex}-${index}">${escape(metric.label)} over time</h3>${renderReportTrendSVG(group, metric.key, { height: 180 })}${caption ? `<figcaption class="report-caption">${escape(caption)}</figcaption>` : ''}</figure>`;
    })
    .join('');
}

function gameTable(group) {
  const primary = (group.metrics ?? []).find((metric) => metric.key !== 'accuracyPct');
  const rows = group.results
    .map(
      (result) =>
        `<tr><td>${escape(dateLabel(result.createdAt))}${result.id === group.baseline?.id ? '<small>Starting point</small>' : ''}</td><td>${escape(valueLabel(result.metrics?.accuracyPct, '%'))}</td><td>${primary ? escape(valueLabel(result.metrics?.[primary.key], primary.unit)) : '—'}</td><td>${escape(valueLabel(result.durationMs / 1000, 's'))}</td></tr>`,
    )
    .join('');
  return `<section class="report-games-table${group.results.length <= 6 ? ' report-small-game-list' : ''}"><h3 class="report-subheading">Games in this selection</h3><table class="report-game-list"><caption>Oldest first. Full measurements follow in the details section.</caption><thead><tr><th scope="col">Date and time</th><th scope="col">Accuracy</th><th scope="col">${escape(primary?.label ?? 'Other measurement')}</th><th scope="col">Game time</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function trendSection(group, index) {
  const baseline = group.baseline,
    latest = group.latest ?? group.results.at(-1);
  const chartMarkup = charts(group, index),
    tableMarkup = gameTable(group);
  // An extra dashboard measurement may need a second page. Keep the compact
  // game list with the group summary instead of stranding it after the charts.
  const content =
    group.metrics?.length > 2 ? `${tableMarkup}${chartMarkup}` : `${chartMarkup}${tableMarkup}`;
  return `<section class="report-game-section" id="report-group-${index}"><header><p class="report-group-kicker">Game results · Setup ${index + 1}</p><h2 class="report-group-title">${escape(group.activityName)}</h2><p class="report-setup"><strong>Setup:</strong> ${escape(setupLabel(group))}</p><p class="report-group-meta"><span>Game version ${escape(group.protocolVersion)} · Measurement version ${escape(group.metricVersion)}</span><span>${escape(helpLabel(group))}</span><span>${group.results.length} saved ${group.results.length === 1 ? 'game' : 'games'}</span></p></header>${metricCards(group)}<p class="report-trend-note">Latest game: ${escape(dateLabel(latest?.createdAt))}. ${baseline ? `Starting point: ${escape(dateLabel(baseline.createdAt))}.` : 'Starting point unavailable.'} Compare this game and setup only.</p>${content}</section>`;
}

function measurementDetails(group, groupIndex, includeNotes) {
  const measurements = group.allMetrics ?? group.metrics ?? [];
  const baseline = group.baseline;
  const games = group.results
    .map((result, resultIndex) => {
      const rows = measurements
        .filter((metric) => Object.hasOwn(result.metrics ?? {}, metric.key))
        .map(
          (metric) =>
            `<tr><td>${escape(metric.label)}<small>${escape(metric.unit)}</small></td><td>${escape(valueLabel(result.metrics[metric.key], metric.unit))}</td><td>${escape(valueLabel(baseline?.metrics?.[metric.key], metric.unit))}</td><td>${escape(changeLabel(result.metrics[metric.key], baseline?.metrics?.[metric.key], metric.unit, result.id === baseline?.id))}</td></tr>`,
        );
      rows.push(
        `<tr><td>Recorded game time<small>s</small></td><td>${escape(valueLabel(result.durationMs / 1000, 's'))}</td><td>${escape(valueLabel(baseline ? baseline.durationMs / 1000 : null, 's'))}</td><td>${escape(changeLabel(result.durationMs / 1000, baseline ? baseline.durationMs / 1000 : null, 's', result.id === baseline?.id))}</td></tr>`,
      );
      const issues = result.quality?.issues ?? [];
      return `<section class="report-data-game"><h4>Game ${resultIndex + 1} · ${escape(dateLabel(result.createdAt))}${result.id === baseline?.id ? ' · starting point' : ''} · Setup help: ${result.context?.caregiverSetupHelp ? 'yes' : 'no'}${result.context?.assistedInput || result.context?.caregiverProvidedInput ? ' · Input help: yes' : ''}</h4><table class="report-measurements"><thead><tr><th scope="col">Measurement</th><th scope="col">Result</th><th scope="col">Starting point</th><th scope="col">Change</th></tr></thead><tbody>${rows.join('')}</tbody></table>${includeNotes && result.notes ? `<p class="report-game-note"><strong>Notes:</strong> ${escape(result.notes)}</p>` : ''}${issues.length ? `<p class="report-quality"><strong>Recording notes:</strong> ${escape(issues.join(' · '))}</p>` : ''}</section>`;
    })
    .join('');
  return `<section class="report-data-group"><h3>${escape(group.activityName)} · Setup ${groupIndex + 1}</h3><p class="report-setup">${escape(setupLabel(group))} · Game version ${escape(group.protocolVersion)} · Measurement version ${escape(group.metricVersion)}</p><p class="report-caption">${baseline ? `Starting point recorded ${escape(dateLabel(baseline.createdAt))}.` : 'Starting point unavailable.'} ${escape(helpLabel(group))}.</p>${games}</section>`;
}

function definitions(groups) {
  const definitionsByActivity = new Map();
  for (const group of groups) {
    const key = `${group.activityId}:${group.protocolVersion}`;
    if (!definitionsByActivity.has(key))
      definitionsByActivity.set(key, { group, metrics: new Map() });
    const definition = definitionsByActivity.get(key);
    for (const metric of group.allMetrics ?? group.metrics ?? [])
      definition.metrics.set(metric.key, metric);
  }
  return `<section class="report-definitions"><h2>What the measurements mean</h2><p class="report-caption">Accuracy has a different meaning in each game. Compare the same game version and setup. A higher or lower result does not show medical recovery.</p>${[...definitionsByActivity.values()].map(({ group, metrics }) => `<h3>${escape(group.activityName)} · Game version ${escape(group.protocolVersion)}</h3><ul>${[...metrics.values()].map((metric) => `<li><strong>${escape(`${group.activityName} (game version ${group.protocolVersion}): ${metric.label} (${metric.unit})`)}</strong> — ${escape(metric.description)}</li>`).join('')}</ul>`).join('')}</section>`;
}

/** Pure, self-contained HTML for the same report preview and PDF print flow. */
export function renderReportDocument(
  model,
  {
    title = 'Your progress report',
    rangeLabel = model.rangeLabel ?? 'Selected results',
    generatedAtLabel,
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    includeNotes = false,
    limitations = '',
    selectionLabel = 'All activities',
    weekly = true,
  } = {},
) {
  const groups = model.groups ?? [],
    summary = model.summary ?? {};
  const completed = summary.completedGames ?? model.results?.length ?? 0;
  const generated = generatedAtLabel ?? dateLabel(model.generatedAt ?? new Date());
  const summaryCards = [
    ['Games completed', completed],
    ['Days played', summary.activeDays ?? 0],
    ['Different games', summary.distinctGames ?? 0],
    ['Setups used', summary.seriesCount ?? groups.length],
  ];
  const brand =
    '<div class="report-brand"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 31c-7-10-19-4-18 5 1 14 24 16 35 0C61 18 39 3 20 14" fill="none" stroke="#6840aa" stroke-width="5" stroke-linecap="round"/></svg><span>TraceBack</span></div>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TraceBack ${escape(title)} · ${escape(rangeLabel)}</title><style>${REPORT_STYLE}</style></head>
<body><div class="report-toolbar"><p>Your report is ready. Choose Print, then Save as PDF to keep a copy.</p><button type="button" class="report-print" onclick="window.print()">Print / Save as PDF</button></div>
<main class="report-document"><header>${brand}<p class="report-eyebrow">${weekly ? 'Weekly activity report' : 'Saved game results'}</p><h1>${escape(title)}</h1><p class="report-range">${escape(rangeLabel)}</p><p class="report-selection">${escape(selectionLabel)}</p><div class="report-meta"><span><strong>Generated:</strong> ${escape(generated)} (${escape(timezone)})</span><span><strong>Completed games:</strong> ${escape(completed)}</span></div></header>
<section class="report-overview" aria-labelledby="report-overview-heading"><h2 class="report-section-title" id="report-overview-heading">Your practice at a glance</h2><dl class="report-summary">${summaryCards.map(([label, value]) => `<div class="report-stat"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="report-overview-note">Counts describe the selected games. Accuracy is not averaged across games or setups.</p></section>
${completed ? `<figure class="report-frequency"><h2>Games played over time</h2>${renderReportFrequencySVG(model, { height: 180 })}<figcaption class="report-caption">Games completed ${model.frequency?.unit === 'week' ? 'each week. Weeks start on Monday.' : 'each day. Empty days show 0.'} This graph counts games, not accuracy.</figcaption></figure>` : ''}
${limitations ? `<aside class="report-notice"><strong>Reading your results</strong>${escape(limitations)}</aside>` : ''}
${completed ? `<nav class="report-contents" aria-label="Report contents"><h2>Inside this report</h2><ol>${groups.map((group, index) => `<li><span class="report-index">${index + 1}.</span><a href="#report-group-${index}">${escape(group.activityName)} · Setup ${index + 1}</a></li>`).join('')}<li><span class="report-index">+</span><a href="#report-details">Full measurement details</a></li></ol></nav>` : '<section class="report-empty"><h2>No saved games in this selection</h2><p>Choose another date range or game, or finish and save a game to begin your report. No results have been estimated.</p></section>'}
${groups.map(trendSection).join('')}
${completed ? `<section class="report-data-section" id="report-details"><h2 class="report-section-title">Full measurement details</h2><p class="report-data-intro">Every saved game in this selection is listed below. Each starting point is the first saved game with the same activity and game version, hand, device, input, target size and game area. Starting points may be from an earlier week. Missing values mean “not recorded”, never zero. ${includeNotes ? 'Notes are included.' : 'Notes are not included.'}</p>${groups.map((group, index) => measurementDetails(group, index, includeNotes)).join('')}</section>${definitions(groups)}` : ''}
<footer class="report-footer"><p class="report-footer-brand">TraceBack · Make progress visible</p><p>${weekly ? 'Only games completed during the selected local-calendar week appear in this report.' : 'Only games matching the selected date range, game and setup appear in this report.'} Each setup and game version keeps its own starting point.</p><p>Device names are entered by the user and do not prove which device was used. Results are stored in the browser where the activities were completed. This file is a copy of the selected results and is not updated automatically.</p></footer></main></body></html>`;
}
