import { activityById } from '../activities/registry.js';
import { baselineForResult } from '../data/baselines.js';
import { describeChange, formatValue, metricMetadata } from '../export/report.js';
import { dateTime, node } from './results-helpers.js';

export function savedResultsTable(store, results, caption) {
  const wrapper = node('div', undefined, 'history-table-wrap');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Saved game results. Scroll sideways to see every column.');

  const table = node('table', undefined, 'history-table');
  table.append(node('caption', caption));
  const head = node('thead');
  const headerRow = node('tr');

  for (const title of [
    'Date and time',
    'Activity',
    'Accuracy',
    'Starting point',
    'Change',
    'Setup',
  ]) {
    const cell = node('th', title);
    cell.scope = 'col';
    headerRow.append(cell);
  }
  head.append(headerRow);
  table.append(head);

  const body = node('tbody');
  for (const result of results) {
    const baseline = baselineForResult(store, result);
    const row = node('tr');
    const time = node('time', dateTime(result.createdAt));
    time.dateTime = result.createdAt;
    const dateCell = node('td');
    dateCell.append(time);
    row.append(dateCell);
    row.append(node('td', activityById(result.activityId)?.name ?? result.activityId));
    row.append(accuracyCell(result));

    const baselineCell = node(
      'td',
      baseline ? formatValue(baseline.metrics.accuracyPct, '%') : 'Unavailable',
    );
    if (baseline) baselineCell.append(node('small', dateTime(baseline.createdAt)));
    row.append(baselineCell);
    row.append(node('td', describeChange(result, baseline, 'accuracyPct', '%')));
    row.append(setupCell(store, result));
    body.append(row);
  }

  table.append(body);
  wrapper.append(table);
  return wrapper;
}

function accuracyCell(result) {
  const cell = node('td');
  const accuracy = metricMetadata('accuracyPct', result.activityId, result.protocolVersion);
  cell.append(
    node('strong', formatValue(result.metrics.accuracyPct, '%')),
    node('small', accuracy.label),
  );

  if (Number.isFinite(result.metrics.scorePoints)) {
    cell.append(node('strong', `Score: ${formatValue(result.metrics.scorePoints, 'points')}`));
  }

  const details = node('details');
  details.append(node('summary', 'Other results'));
  const list = node('dl', undefined, 'history-detail-list');

  for (const [key, value] of Object.entries(result.metrics)) {
    if (key === 'accuracyPct' || key === 'scorePoints') continue;
    const metadata = metricMetadata(key, result.activityId, result.protocolVersion);
    list.append(node('dt', metadata.label), node('dd', formatValue(value, metadata.unit)));
  }

  if (!list.children.length) {
    list.append(node('dt', 'Duration'), node('dd', formatValue(result.durationMs / 1000, 's')));
  }

  details.append(list);
  cell.append(details);
  return cell;
}

function setupCell(store, result) {
  const device = store.devices.find((item) => item.id === result.context.deviceId);
  const cell = node(
    'td',
    `${result.context.hand} hand · ${device?.label ?? 'Unknown device'} · ${result.context.pointerType}`,
  );
  cell.append(
    node(
      'small',
      `${result.context.surfaceCssWidth} × ${result.context.surfaceCssHeight} CSS px · ${result.config.targetSizeMode} targets`,
    ),
    node('small', `Game version ${result.protocolVersion}`),
  );

  if (result.context.assistedInput) {
    cell.append(node('small', 'Someone helped move or click'));
  } else if (result.context.caregiverSetupHelp) {
    cell.append(node('small', 'Help with setup'));
  }

  return cell;
}
