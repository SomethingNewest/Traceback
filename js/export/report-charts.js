import { trendGeometry } from '../data/trends.js';

const e = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const n = (value) => Number(value.toFixed(2));
const number = (value) =>
  new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 }).format(value);
const shortDate = (value, includeYear = false) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
const font = 'font-family="Arial, sans-serif"';
const colors = {
  ink: '#27243a',
  muted: '#59556d',
  grid: '#dcd9e5',
  violet: '#6240a0',
  baseline: '#686176',
  bar: '#7855b0',
};
const hash = (text) => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
};

function svgStart(id, title, description, height, extraClass) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="report-chart-svg ${extraClass}" width="650" height="${height}" viewBox="0 0 650 ${height}" role="img" aria-labelledby="${id}-title ${id}-desc" ${font}><title id="${id}-title">${e(title)}</title><desc id="${id}-desc">${e(description)}</desc><rect x="0" y="0" width="650" height="${height}" fill="#ffffff"/>`;
}

/** Static, self-contained vectors survive both Save as PDF and standalone HTML downloads. */
export function renderReportTrendSVG(group, metricKey, { height = 240 } = {}) {
  if (!Number.isFinite(height) || height < 180 || height > 400)
    throw new Error('Choose a chart height between 180 and 400.');
  const metric =
    group.metrics.find((item) => item.key === metricKey) ??
    group.allMetrics?.find((item) => item.key === metricKey);
  if (!metric) return '';
  const id = `trend-${hash(`${group.comparisonKey}:${metricKey}`)}`;
  const pointsCount = group.results.filter((result) =>
    Number.isFinite(result.metrics?.[metricKey]),
  ).length;
  const baselineValue = Number.isFinite(metric.baselineValue) ? metric.baselineValue : null;
  const title = `${group.activityName}: ${metric.label}`;
  const description = `${pointsCount} recorded measurement${pointsCount === 1 ? '' : 's'} in ${group.results.length} saved game${group.results.length === 1 ? '' : 's'}. ${baselineValue === null ? 'No starting point measurement is available.' : `Dashed line: starting point ${number(baselineValue)} ${metric.unit}, recorded ${new Date(group.baseline.createdAt).toLocaleString()}.`} Horizontal positions use the actual game times. A missing measurement leaves a gap. Each line includes only this game version and setup.`;
  let svg = svgStart(id, title, description, height, 'report-trend-svg');
  if (!pointsCount)
    return `${svg}<text x="325" y="${height / 2}" text-anchor="middle" fill="${colors.muted}" font-size="15">No recorded measurements for this selection.</text></svg>`;
  const geometry = trendGeometry(group.results, metricKey, {
    width: 650,
    height: height - 8,
    baselineValue,
    percent: metric.unit === '%',
  });
  const { bounds } = geometry;
  svg += `<text x="${bounds.left}" y="15" fill="${colors.muted}" font-size="11">${e(metric.unit || 'Recorded value')}</text>`;
  for (const tick of geometry.ticks) {
    svg += `<line x1="${bounds.left}" y1="${n(tick.y)}" x2="${bounds.right}" y2="${n(tick.y)}" stroke="${colors.grid}" stroke-width="1"/><text x="${bounds.left - 12}" y="${n(tick.y + 4)}" text-anchor="end" fill="${colors.muted}" font-size="11">${e(number(tick.value))}${metric.unit === '%' ? '%' : ''}</text>`;
  }
  svg += `<line x1="${bounds.left}" y1="${bounds.top}" x2="${bounds.left}" y2="${bounds.bottom}" stroke="${colors.muted}" stroke-width="1"/>`;
  if (geometry.baselineY !== null)
    svg += `<line x1="${bounds.left}" y1="${n(geometry.baselineY)}" x2="${bounds.right}" y2="${n(geometry.baselineY)}" stroke="${colors.baseline}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  for (const segment of geometry.segments) {
    if (segment.length > 1)
      svg += `<polyline points="${segment.map((point) => `${n(point.x)},${n(point.y)}`).join(' ')}" fill="none" stroke="${colors.violet}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  for (const point of geometry.points) {
    if (point.value === null) continue;
    svg += `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="4" fill="${colors.violet}" stroke="#ffffff" stroke-width="1.5"><title>${e(`${new Date(point.result.createdAt).toLocaleString()}: ${number(point.value)} ${metric.unit}`)}</title></circle>`;
    if (pointsCount <= 8) {
      const anchor =
        point.x < bounds.left + 25 ? 'start' : point.x > bounds.right - 25 ? 'end' : 'middle';
      const y = point.y < bounds.top + 15 ? point.y + 18 : point.y - 10;
      svg += `<text x="${n(point.x)}" y="${n(y)}" text-anchor="${anchor}" fill="${colors.ink}" font-size="11" font-weight="700">${e(number(point.value))}${metric.unit === '%' ? '%' : ''}</text>`;
    }
  }
  const first = geometry.points[0],
    last = geometry.points.at(-1);
  if (geometry.firstTime === geometry.lastTime) {
    svg += `<text x="${n(first.x)}" y="${bounds.bottom + 22}" text-anchor="middle" fill="${colors.muted}" font-size="11">${e(shortDate(first.time, true))}</text>`;
  } else {
    const sameDay = new Date(first.time).toDateString() === new Date(last.time).toDateString();
    const crossesYear = new Date(first.time).getFullYear() !== new Date(last.time).getFullYear();
    const label = (time) =>
      sameDay
        ? new Date(time).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
          })
        : shortDate(time, crossesYear);
    svg += `<text x="${bounds.left}" y="${bounds.bottom + 22}" fill="${colors.muted}" font-size="11">${e(label(first.time))}</text><text x="${bounds.right}" y="${bounds.bottom + 22}" text-anchor="end" fill="${colors.muted}" font-size="11">${e(label(last.time))}</text>`;
  }
  const legendY = height - 19;
  svg += `<line x1="72" y1="${legendY}" x2="96" y2="${legendY}" stroke="${colors.violet}" stroke-width="2.5"/><circle cx="84" cy="${legendY}" r="3" fill="${colors.violet}"/><text x="104" y="${legendY + 4}" fill="${colors.ink}" font-size="11">Saved game</text>`;
  if (baselineValue !== null)
    svg += `<line x1="245" y1="${legendY}" x2="269" y2="${legendY}" stroke="${colors.baseline}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="277" y="${legendY + 4}" fill="${colors.ink}" font-size="11">${e(`Starting point: ${number(baselineValue)}${metric.unit === '%' ? '%' : ` ${metric.unit}`}`)}</text>`;
  return `${svg}</svg>`;
}

export function renderReportFrequencySVG(model, { height = 190 } = {}) {
  if (!Number.isFinite(height) || height < 180 || height > 400)
    throw new Error('Choose a chart height between 180 and 400.');
  const { buckets, unit, message } = model.frequency;
  const id = `frequency-${hash(`${model.rangeLabel}:${buckets.map((bucket) => `${bucket.key}:${bucket.count}`).join('|')}`)}`;
  const count = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  let svg = svgStart(
    id,
    'Games completed over time',
    message ??
      `${count} completed games. Each bar counts games in one ${unit}. Counts include all selected game types; accuracy scores are not averaged.`,
    height,
    'report-frequency-svg',
  );
  if (message)
    return `${svg}<text x="325" y="${height / 2 - 12}" text-anchor="middle" fill="${colors.muted}" font-size="14">${message
      .split(/(?<=\.)\s+/)
      .map((line, index) => `<tspan x="325" dy="${index ? 24 : 0}">${e(line)}</tspan>`)
      .join('')}</text></svg>`;
  if (!buckets.length)
    return `${svg}<text x="325" y="${height / 2}" text-anchor="middle" fill="${colors.muted}" font-size="15">No saved games in this selection.</text></svg>`;
  const bounds = { left: 54, right: 626, top: 40, bottom: height - 62 };
  const maximum = buckets.reduce((maximum, bucket) => Math.max(maximum, bucket.count), 1);
  const crossesYear =
    new Date(buckets[0].date).getFullYear() !== new Date(buckets.at(-1).date).getFullYear();
  const step = (bounds.right - bounds.left) / buckets.length;
  const barWidth = Math.max(0.2, step * 0.62);
  svg += `<text x="${bounds.left}" y="15" fill="${colors.muted}" font-size="11">Completed games</text>`;
  const ticks = [...new Set([0, Math.ceil(maximum / 2), maximum])];
  for (const tick of ticks) {
    const y = bounds.bottom - (tick / maximum) * (bounds.bottom - bounds.top);
    svg += `<line x1="${bounds.left}" y1="${n(y)}" x2="${bounds.right}" y2="${n(y)}" stroke="${colors.grid}"/><text x="${bounds.left - 10}" y="${n(y + 4)}" text-anchor="end" fill="${colors.muted}" font-size="11">${tick}</text>`;
  }
  for (const [index, bucket] of buckets.entries()) {
    const x = bounds.left + step * (index + 0.5),
      barHeight = (bucket.count / maximum) * (bounds.bottom - bounds.top);
    svg += `<rect x="${n(x - barWidth / 2)}" y="${n(bounds.bottom - barHeight)}" width="${n(barWidth)}" height="${n(barHeight)}" rx="2" fill="${colors.bar}"><title>${e(`${unit === 'week' ? 'Week of ' : ''}${bucket.key}: ${bucket.count} games`)}</title></rect>`;
    if (buckets.length <= 12)
      svg += `<text x="${n(x)}" y="${n(bounds.bottom - barHeight - 8)}" text-anchor="middle" fill="${colors.ink}" font-weight="700" font-size="12">${bucket.count}</text>`;
    const showLabel =
      buckets.length <= 8 ||
      index === 0 ||
      index === buckets.length - 1 ||
      index % Math.ceil(buckets.length / 6) === 0;
    if (showLabel) {
      const label =
        buckets.length <= 7 && unit === 'day'
          ? new Date(bucket.date).toLocaleDateString(undefined, { weekday: 'short' })
          : shortDate(bucket.date, crossesYear);
      const anchor =
        buckets.length > 8 && index === 0
          ? 'start'
          : buckets.length > 8 && index === buckets.length - 1
            ? 'end'
            : 'middle';
      svg += `<text x="${n(x)}" y="${height - 39}" text-anchor="${anchor}" fill="${colors.muted}" font-size="11">${e(label)}</text>`;
    }
  }
  svg += `<text x="${bounds.left}" y="${height - 11}" fill="${colors.muted}" font-size="11">${e(unit === 'week' ? 'Each bar is one local-calendar week, starting Monday.' : 'Each bar is one local-calendar day.')}</text>`;
  return `${svg}</svg>`;
}
