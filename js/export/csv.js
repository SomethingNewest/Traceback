import { reportRows } from './report.js';

// Text from the user should stay text, even if a spreadsheet app
// would normally treat it as a formula.
export function csvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot export a nonfinite number.');
    }
    return String(value);
  }

  let text = String(value);
  if (/^\s*[=+\-@]/.test(text) || /^[\u0000-\u001f]/.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replaceAll('"', '""') + '"';
}

export const CSV_HEADERS = Object.freeze([
  'result_id',
  'activity_id',
  'created_at_iso',
  'series_id',
  'baseline_result_id',
  'baseline_created_at_iso',
  'protocol_version',
  'metric_version',
  'hand',
  'device_label',
  'pointer_type',
  'surface_width_css_px',
  'surface_height_css_px',
  'target_mode',
  'assisted_input',
  'caregiver_provided_input',
  'caregiver_setup_help',
  'fatigue_1_to_5',
  'metric_key',
  'value',
  'unit',
  'baseline_value',
  'absolute_change',
  'absolute_change_unit',
  'percent_change',
  'is_demo',
  'notes',
]);

export function exportCSV(store, results = store.results, { includeNotes = false } = {}) {
  const lines = [CSV_HEADERS.join(',')];
  const rows = reportRows(store, results, { includeNotes: includeNotes });

  for (const row of rows) {
    const result = row.result;
    const baseline = row.baseline;
    const context = result.context;

    let changeUnit = row.metadata.unit;
    if (changeUnit === '%') {
      changeUnit = 'percentage points';
    }

    const cells = [
      result.id,
      result.activityId,
      result.createdAt,
      result.seriesId,
      baseline ? baseline.id : null,
      baseline ? baseline.createdAt : null,
      result.protocolVersion,
      result.metricVersion,
      context.hand,
      row.deviceLabel,
      context.pointerType,
      context.surfaceCssWidth,
      context.surfaceCssHeight,
      result.config.targetSizeMode,
      context.assistedInput,
      context.caregiverProvidedInput,
      context.caregiverSetupHelp,
      context.fatigue,
      row.key,
      row.value,
      row.metadata.unit,
      row.baselineValue,
      row.absoluteChange,
      changeUnit,
      row.percentChange,
      false,
      row.notes,
    ];
    lines.push(cells.map(csvCell).join(','));
  }

  return lines.join('\r\n') + '\r\n';
}
