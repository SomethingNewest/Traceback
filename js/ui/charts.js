import { trendGeometry, gameCounts } from '../data/trends.js';
import { formatValue } from '../export/report.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
const fullDate = (value) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const shortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const axisValue = (value) =>
  new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 3,
    notation:
      Math.abs(value) >= 10000
        ? 'compact'
        : value !== 0 && Math.abs(value) < 0.001
          ? 'scientific'
          : 'standard',
  }).format(value);

let emptyChartId = 0;

function emptyChartFrame({ kind, label, percent = false }) {
  // Keep the explanation available even if SVG is unavailable.
  if (typeof document.createElementNS !== 'function') return null;
  const id = `results-empty-${kind}-${++emptyChartId}`;
  const svg = svgNode('svg', {
    viewBox: '0 0 760 260',
    role: 'img',
    'aria-labelledby': `${id}-title ${id}-description`,
    class: 'results-line-chart results-empty-chart',
    'data-empty-chart': kind,
  });
  svg.append(
    svgNode('title', { id: `${id}-title` }, `No saved games for ${label.toLowerCase()}`),
    svgNode(
      'desc',
      { id: `${id}-description` },
      `No data is plotted for this selection. No game values or dates have been added.${percent ? ' The percentage scale runs from 0 to 100.' : ' A numbered scale will appear when results are available.'}`,
    ),
  );
  for (let index = 0; index < 5; index++) {
    const y = 30 + index * 42;
    svg.append(
      svgNode('line', {
        x1: 72,
        x2: 730,
        y1: y,
        y2: y,
        class: 'results-chart-grid',
        'aria-hidden': 'true',
      }),
    );
    if (percent) {
      svg.append(
        svgNode(
          'text',
          { x: 60, y: y + 5, 'text-anchor': 'end', class: 'results-chart-axis' },
          String(100 - index * 25),
        ),
      );
    }
  }
  svg.append(
    svgNode('path', {
      d: 'M72 30V198H730',
      class: 'results-empty-chart-axis-line',
      'aria-hidden': 'true',
    }),
    svgNode(
      'text',
      { x: 400, y: 110, 'text-anchor': 'middle', class: 'results-empty-chart-label' },
      'Your results will appear here',
    ),
    svgNode(
      'text',
      { x: 400, y: 241, 'text-anchor': 'middle', class: 'results-chart-axis' },
      'Saved games over time',
    ),
  );
  const frame = node('div', undefined, 'results-chart-frame results-empty-chart-frame');
  frame.tabIndex = 0;
  frame.setAttribute('role', 'region');
  frame.setAttribute('aria-label', 'Empty graph. Scroll sideways on a small screen.');
  frame.append(node('p', percent ? `${label} (%)` : label, 'results-chart-unit'), svg);
  return frame;
}

export function renderTrendChart(container, { results, metricKey, metadata, baseline }) {
  container.replaceChildren();
  if (!results.length) {
    container.append(
      node(
        'p',
        'No games with this setup in this time range. Try a different range or setup.',
        'results-chart-empty',
      ),
    );
    const frame = emptyChartFrame({
      kind: 'trend',
      label: metadata.label,
      percent: metadata.unit === '%',
    });
    if (frame) container.append(frame);
    return;
  }
  const baselineValue = baseline?.metrics?.[metricKey];
  const geometry = trendGeometry(results, metricKey, {
    baselineValue,
    percent: metadata.unit === '%',
  });
  const svg = svgNode('svg', {
    viewBox: `0 0 ${geometry.width} ${geometry.height}`,
    role: 'img',
    'aria-labelledby': 'results-chart-title results-chart-description',
    class: 'results-line-chart',
  });
  const numericCount = geometry.points.filter((point) => point.value !== null).length;
  svg.append(svgNode('title', { id: 'results-chart-title' }, `${metadata.label} over time`));
  svg.append(
    svgNode(
      'desc',
      { id: 'results-chart-description' },
      `${numericCount} recorded measurements from ${results.length} saved games with the same setup. Dates run from left to right. The vertical scale is 0 to ${formatValue(geometry.maximum, metadata.unit)}. Missing measurements leave a gap. Use the game buttons below to read each result.`,
    ),
  );
  for (const tick of geometry.ticks) {
    svg.append(
      svgNode('line', {
        x1: geometry.bounds.left,
        x2: geometry.bounds.right,
        y1: tick.y,
        y2: tick.y,
        class: 'results-chart-grid',
      }),
    );
    svg.append(
      svgNode(
        'text',
        {
          x: geometry.bounds.left - 12,
          y: tick.y + 5,
          'text-anchor': 'end',
          class: 'results-chart-axis',
        },
        axisValue(tick.value),
      ),
    );
  }
  const dates =
    geometry.firstTime === geometry.lastTime
      ? [geometry.firstTime]
      : [geometry.firstTime, geometry.lastTime];
  for (let index = 0; index < dates.length; index++) {
    svg.append(
      svgNode(
        'text',
        {
          x:
            dates.length === 1
              ? (geometry.bounds.left + geometry.bounds.right) / 2
              : index === 0
                ? geometry.bounds.left
                : geometry.bounds.right,
          y: geometry.height - 16,
          'text-anchor': dates.length === 1 ? 'middle' : index === 0 ? 'start' : 'end',
          class: 'results-chart-axis',
        },
        shortDate(dates[index]),
      ),
    );
  }
  if (geometry.baselineY !== null)
    svg.append(
      svgNode('line', {
        x1: geometry.bounds.left,
        x2: geometry.bounds.right,
        y1: geometry.baselineY,
        y2: geometry.baselineY,
        class: 'results-chart-baseline',
      }),
    );
  for (const segment of geometry.segments) {
    if (segment.length > 1)
      svg.append(
        svgNode('path', {
          d: segment.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' '),
          class: 'results-chart-line',
        }),
      );
  }
  const pointElements = new Map();
  for (const point of geometry.points) {
    if (point.value === null) continue;
    const circle = svgNode('circle', {
      cx: point.x,
      cy: point.y,
      r: 5,
      class: 'results-chart-point',
      'data-chart-point': point.index,
      'aria-hidden': 'true',
    });
    circle.append(
      svgNode(
        'title',
        {},
        `${fullDate(point.result.createdAt)}: ${formatValue(point.value, metadata.unit)}`,
      ),
    );
    svg.append(circle);
    pointElements.set(point.index, circle);
  }
  const chartFrame = node('div', undefined, 'results-chart-frame');
  chartFrame.tabIndex = 0;
  chartFrame.setAttribute('role', 'region');
  chartFrame.setAttribute(
    'aria-label',
    'Trend graph. Scroll sideways on a small screen. Each value is also available in the game buttons below.',
  );
  chartFrame.append(node('p', `${metadata.label} (${metadata.unit})`, 'results-chart-unit'), svg);
  container.append(chartFrame);
  const legend = node('div', undefined, 'results-chart-legend');
  legend.append(node('span', '● Saved game', 'results-legend-result'));
  if (Number.isFinite(baselineValue))
    legend.append(
      node(
        'span',
        `┄ Starting point: ${formatValue(baselineValue, metadata.unit)} · ${shortDate(baseline.createdAt)}`,
        'results-legend-baseline',
      ),
    );
  else legend.append(node('span', 'Starting point not recorded for this measurement.', 'muted'));
  container.append(legend);
  if (numericCount === 1)
    container.append(
      node(
        'p',
        'One measurement is shown. Play this game again with the same setup to build a trend.',
        'results-chart-help',
      ),
    );
  else if (numericCount === 0)
    container.append(
      node(
        'p',
        'This measurement was not recorded in these games. Choose another measurement.',
        'results-chart-help',
      ),
    );
  else
    container.append(
      node(
        'p',
        'Each dot is a saved game. Wider gaps mean more time between games. Select a game below to see its result.',
        'results-chart-help',
      ),
    );
  if (numericCount < results.length)
    container.append(
      node(
        'p',
        `${results.length - numericCount} ${results.length - numericCount === 1 ? 'game has' : 'games have'} no recorded value. The line stops at each missing value.`,
        'results-chart-help',
      ),
    );

  const navigation = node('div', undefined, 'results-point-navigation');
  const previous = node('button', '← Previous game', 'button button-outline button-small');
  previous.type = 'button';
  const next = node('button', 'Next game →', 'button button-outline button-small');
  next.type = 'button';
  const position = node('span', undefined, 'results-point-position');
  navigation.append(previous, position, next);
  const strip = node('div', undefined, 'results-point-strip');
  strip.setAttribute('role', 'group');
  strip.setAttribute(
    'aria-label',
    'Choose a saved game. Use left and right arrow keys to move between games.',
  );
  const details = node('div', undefined, 'results-selected-game');
  details.setAttribute('aria-live', 'polite');
  details.setAttribute('aria-atomic', 'true');
  const pointButtons = geometry.points.map((point, index) => {
    const button = node('button', undefined, 'results-game-choice');
    button.type = 'button';
    button.append(
      node('span', shortDate(point.result.createdAt)),
      node('strong', formatValue(point.value, metadata.unit)),
    );
    button.setAttribute(
      'aria-label',
      `Game ${index + 1}, ${fullDate(point.result.createdAt)}. ${metadata.label}: ${formatValue(point.value, metadata.unit)}.`,
    );
    strip.append(button);
    return button;
  });
  let selectedIndex = -1;
  const select = (index, focus = false) => {
    selectedIndex = Math.max(0, Math.min(index, geometry.points.length - 1));
    const point = geometry.points[selectedIndex];
    for (let current = 0; current < pointButtons.length; current++) {
      pointButtons[current].setAttribute('aria-pressed', String(current === selectedIndex));
      pointButtons[current].tabIndex = current === selectedIndex ? 0 : -1;
      const circle = pointElements.get(current);
      if (circle) {
        circle.setAttribute('data-selected', String(current === selectedIndex));
        circle.setAttribute('r', current === selectedIndex ? 8 : 5);
      }
    }
    previous.disabled = selectedIndex === 0;
    next.disabled = selectedIndex === geometry.points.length - 1;
    position.textContent = `Game ${selectedIndex + 1} of ${geometry.points.length}`;
    details.replaceChildren(
      node('p', `Selected game · ${fullDate(point.result.createdAt)}`, 'results-selected-date'),
      node('p', formatValue(point.value, metadata.unit), 'results-selected-value'),
    );
    const difference =
      Number.isFinite(point.value) && Number.isFinite(baselineValue)
        ? point.value - baselineValue
        : null;
    details.append(
      node(
        'p',
        point.result.id === baseline?.id
          ? 'This is your starting point.'
          : difference === null
            ? 'There is not enough data to compare this measurement.'
            : Math.abs(difference) < 1e-9
              ? 'Same as your starting point.'
              : `${formatValue(Math.abs(difference), metadata.unit === '%' ? 'percentage points' : metadata.unit)} ${difference > 0 ? 'higher' : 'lower'} than your starting point.`,
      ),
    );
    if (focus) pointButtons[selectedIndex].focus();
  };
  pointButtons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', (event) => {
      const requested = {
        ArrowLeft: selectedIndex - 1,
        ArrowRight: selectedIndex + 1,
        Home: 0,
        End: pointButtons.length - 1,
      }[event.key];
      if (requested !== undefined) {
        event.preventDefault();
        select(requested, true);
      }
    });
    pointElements.get(index)?.addEventListener('click', () => select(index, true));
  });
  previous.addEventListener('click', () => select(selectedIndex - 1));
  next.addEventListener('click', () => select(selectedIndex + 1));
  container.append(navigation, strip, details);
  select(geometry.points.length - 1);
}

export function renderFrequencyChart(container, { results, timeframe, now }) {
  container.replaceChildren();
  const { buckets, unit, message } = gameCounts(results, { timeframe, now });
  if (message) {
    container.append(node('p', message, 'results-chart-help'));
    return;
  }
  if (!buckets.length || !buckets.some((bucket) => bucket.count)) {
    container.append(node('p', 'No saved games in this time range.', 'results-chart-empty'));
    const frame = emptyChartFrame({ kind: 'frequency', label: 'Games played' });
    if (frame) container.append(frame);
    return;
  }
  const max = buckets.reduce((maximum, bucket) => Math.max(maximum, bucket.count), 1);
  const list = node('ol', undefined, 'results-frequency-bars');
  list.tabIndex = 0;
  list.setAttribute(
    'aria-label',
    `Number of games played each ${unit}. Scroll sideways to see every date.`,
  );
  for (const bucket of buckets) {
    const item = node('li', undefined, 'results-frequency-item');
    const date = shortDate(bucket.date);
    item.setAttribute(
      'aria-label',
      `${unit === 'week' ? 'Week of ' : ''}${bucket.date.toLocaleDateString(undefined, { dateStyle: 'long' })}: ${bucket.count} ${bucket.count === 1 ? 'game' : 'games'}`,
    );
    const count = node('span', String(bucket.count), 'results-frequency-count');
    const track = node('span', undefined, 'results-frequency-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = node('span', undefined, 'results-frequency-fill');
    fill.style.height = `${(bucket.count / max) * 100}%`;
    track.append(fill);
    item.append(count, track, node('span', date, 'results-frequency-date'));
    list.append(item);
  }
  container.append(
    node(
      'p',
      unit === 'week'
        ? 'Games saved each week. Weeks start on Monday.'
        : 'Games saved each day. Empty days show 0.',
      'results-chart-help',
    ),
    list,
  );
  if (buckets.length > 7)
    container.append(node('p', 'Scroll sideways to see every date.', 'results-chart-help'));
}
