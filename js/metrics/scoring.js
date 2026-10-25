// Scoring for each activity. Points are in a 0-1 unit square and times are
// performance.now() style milliseconds passed in by the activity (not wall clock).
import {
  HOLD_PATH,
  holdCenterAt,
  SPIRAL_GUIDE_WIDTH,
  SPIRAL_MEASUREMENT_STEP,
  SPIRAL_COMFORT_DISTANCE,
} from '../activities/protocol.js';

const TOO_LONG = 'This trace is too long to measure. Please start again.';

function isPoint(point) {
  if (point === null || point === undefined) return false;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ratio(hits, attempts) {
  if (attempts > 0) {
    return Math.min(100, Math.max(0, (hits / attempts) * 100));
  }
  return null;
}

function mean(values) {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

// coefficient of variation (std dev / mean)
function variation(values) {
  if (values.length === 0) {
    return null;
  }
  const average = mean(values);
  if (!(average > 1e-6)) {
    return null;
  }
  const squares = [];
  for (const value of values) {
    squares.push((value - average) ** 2);
  }
  return Math.sqrt(mean(squares)) / average;
}

function median(values) {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function strokeLength(stroke) {
  let length = 0;
  for (let i = 1; i < stroke.length; i++) {
    length += distance(stroke[i - 1], stroke[i]);
  }
  return length;
}

function countUniquePoints(points) {
  const seen = new Set();
  for (const point of points) {
    seen.add(point.x.toFixed(6) + ',' + point.y.toFixed(6));
  }
  return seen.size;
}

function countAttempts(attempts) {
  if (Array.isArray(attempts)) {
    return attempts.length;
  }
  if (Number.isFinite(attempts)) {
    return Math.max(0, Math.floor(attempts));
  }
  return 0;
}

function completionSeconds(durationMs) {
  if (Number.isFinite(durationMs)) {
    return Math.max(0, durationMs) / 1000;
  }
  return null;
}

export function pointToSegmentDistance(point, a, b) {
  if (!isPoint(point) || !isPoint(a) || !isPoint(b)) {
    throw new Error('Path coordinates must be finite.');
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  let projectionT = 0;
  if (lengthSquared) {
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    projectionT = Math.max(0, Math.min(1, t));
  }

  return {
    distance: Math.hypot(point.x - a.x - projectionT * dx, point.y - a.y - projectionT * dy),
    projectionT: projectionT,
  };
}

// each stroke is resampled on its own - lifting the pen should never fill in a gap
export function resampleStroke(stroke, spacing = 0.002) {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error('Trace spacing must be a positive finite number.');
  }
  if (stroke.length === 0) {
    return [];
  }
  if (!stroke.every(isPoint)) {
    throw new Error('Path coordinates must be finite.');
  }

  const pathLength = strokeLength(stroke);
  if (pathLength / spacing > 25000) {
    throw new Error(TOO_LONG);
  }

  const result = [stroke[0]];
  let carried = 0;
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1];
    const b = stroke[i];
    const length = distance(a, b);
    if (!length) continue;

    let along = spacing - carried;
    while (along <= length + 1e-12) {
      const fraction = Math.min(1, along / length);
      result.push({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
      along += spacing;
    }
    carried = Math.max(0, length - (along - spacing));
  }

  const lastPoint = stroke[stroke.length - 1];
  if (distance(result[result.length - 1], lastPoint) > 1e-10) {
    result.push(lastPoint);
  }
  return result;
}

// samples speed every 50ms along each stroke. gaps over 200ms are skipped
function traceSpeeds(strokes) {
  const speeds = [];
  for (const stroke of strokes) {
    if (stroke.length < 2) continue;

    let previous = null;
    let segment = 1;
    const endTime = stroke[stroke.length - 1].t;
    for (let time = stroke[0].t; Number.isFinite(time) && time <= endTime; time += 50) {
      while (segment < stroke.length - 1 && stroke[segment].t < time) {
        segment++;
      }
      const a = stroke[segment - 1];
      const b = stroke[segment];
      const delta = b.t - a.t;
      if (delta <= 0 || delta > 200 || time < a.t || time > b.t) {
        previous = null;
        continue;
      }
      const part = (time - a.t) / delta;
      const point = { x: a.x + (b.x - a.x) * part, y: a.y + (b.y - a.y) * part, t: time };
      if (previous && point.t - previous.t === 50) {
        speeds.push(distance(point, previous) / 0.05);
      }
      previous = point;
    }
  }
  return speeds;
}

// Protocol 3 weights each sample by real line length (including a short last piece).
// A tap has no length so it counts for nothing, and lots of tiny strokes can't beat one long one.
function lengthWeights(sampledStrokes, cleanStrokes) {
  const weights = [];
  for (let s = 0; s < sampledStrokes.length; s++) {
    const samples = sampledStrokes[s];
    const length = strokeLength(cleanStrokes[s]);

    if (samples.length === 1) {
      weights.push(length);
      continue;
    }

    const arcs = [];
    for (let i = 0; i < samples.length; i++) {
      if (i === samples.length - 1) {
        arcs.push(length);
      } else {
        arcs.push(Math.min(length, i * 0.002));
      }
    }

    for (let i = 0; i < arcs.length; i++) {
      let before = 0;
      let after = 0;
      if (i) {
        before = arcs[i] - arcs[i - 1];
      }
      if (i < arcs.length - 1) {
        after = arcs[i + 1] - arcs[i];
      }
      weights.push((before + after) / 2);
    }
  }
  return weights;
}

export function scoreTrace(strokes, target, config = {}) {
  if (
    !Array.isArray(strokes) ||
    !Array.isArray(target) ||
    target.length < 2 ||
    !target.every(isPoint)
  ) {
    throw new Error('A trace and target path are required.');
  }

  const cleanStrokes = [];
  for (const stroke of strokes) {
    const kept = stroke.filter(isPoint);
    if (kept.length > 0) {
      cleanStrokes.push(kept);
    }
  }
  const raw = cleanStrokes.flat();
  if (raw.length > 100000) {
    throw new Error(TOO_LONG);
  }

  let rawLength = 0;
  for (const stroke of cleanStrokes) {
    rawLength += strokeLength(stroke);
  }
  if (rawLength > 50) {
    throw new Error(TOO_LONG);
  }

  const sampledStrokes = cleanStrokes.map((stroke) => resampleStroke(stroke));
  const points = sampledStrokes.flat();
  if (points.length > 30000) {
    throw new Error(TOO_LONG);
  }

  let weights;
  if (config.lengthWeighted === true) {
    weights = lengthWeights(sampledStrokes, cleanStrokes);
  } else {
    weights = points.map(() => 1);
  }

  const cumulative = [0];
  for (let i = 1; i < target.length; i++) {
    cumulative.push(cumulative[cumulative.length - 1] + distance(target[i - 1], target[i]));
  }
  const totalLength = cumulative[cumulative.length - 1];
  if (!totalLength) {
    throw new Error('The target path must have a length.');
  }

  let tolerance = config.tolerance;
  if (tolerance === undefined || tolerance === null) {
    tolerance = 0.035;
  }

  const bins = new Set();
  let distanceSum = 0;
  let closePoints = 0;
  let totalWeight = 0;

  for (let p = 0; p < points.length; p++) {
    const point = points[p];
    const weight = weights[p];
    if (weight <= 0) continue;

    let nearest = Infinity;
    let arc = 0;
    for (let i = 1; i < target.length; i++) {
      const projection = pointToSegmentDistance(point, target[i - 1], target[i]);
      if (projection.distance < nearest) {
        nearest = projection.distance;
        arc = cumulative[i - 1] + projection.projectionT * (cumulative[i] - cumulative[i - 1]);
      }
    }

    distanceSum += nearest * weight;
    totalWeight += weight;
    if (nearest <= tolerance) {
      closePoints += weight;
      bins.add(Math.min(99, Math.floor((arc / totalLength) * 100)));
    }
  }

  const coveragePct = bins.size;
  const uniquePointCount = countUniquePoints(raw);
  const startedAtStart = raw.length > 0 && distance(raw[0], target[0]) <= 0.05;
  const targetEnd = target[target.length - 1];
  const reachedEnd = raw.some((point) => distance(point, targetEnd) <= 0.05);

  const issues = [];
  if (config.allowPartial === true) {
    if (uniquePointCount < 2 || rawLength < 0.002) {
      issues.push('Draw a short line before selecting Finish.');
    }
  } else {
    if (!startedAtStart) issues.push('Begin at the Start dot.');
    if (!reachedEnd) issues.push('Follow the line to the Finish dot.');
    if (coveragePct < 90) issues.push(`Keep tracing the line. You have covered ${coveragePct}%.`);
    if (uniquePointCount < 30) issues.push('Keep drawing along the line.');
  }

  const speeds = traceSpeeds(cleanStrokes);

  return {
    metrics: {
      accuracyPct: ratio(closePoints, totalWeight),
      meanDistancePctWidth: totalWeight ? (distanceSum / totalWeight) * 100 : null,
      coveragePct: coveragePct,
      speedCV: speeds.length >= 10 ? variation(speeds) : null,
      completionSeconds: completionSeconds(config.durationMs),
    },
    quality: {
      issues: points.length ? [] : ['No drawing was recorded.'],
      sampleCount: raw.length,
      uniquePointCount: uniquePointCount,
      speedIntervalCount: speeds.length,
    },
    validity: {
      valid: issues.length === 0,
      issues: issues,
      startedAtStart: startedAtStart,
      reachedEnd: reachedEnd,
    },
  };
}

// protocol 3: only the drawn line is scored, coverage and reaching the end don't matter
export function scoreTraceAlignment(strokes, target, config = {}) {
  const options = Object.assign({}, config, { allowPartial: true, lengthWeighted: true });
  return scoreTrace(strokes, target, options);
}

// Protocol 4: compare the drawn line to the visible spiral guide.
// Every small piece of line gets 1 - distance / guideRadius (clamped to 0..1)
// and is weighted by its real length, so lifting, dots or extra events add nothing.
// Pieces are at most SPIRAL_MEASUREMENT_STEP long and measured at their midpoint.
// The target is checked against finite segments (endpoints included).
export function scoreTracePrecision(strokes, target, config = {}) {
  return measureTrace(strokes, target, config, false);
}

// Protocol 5 keeps full credit inside the visible guide. Beyond its edge, credit
// falls gradually to zero. Every drawn piece still counts by its actual length.
export function scoreTraceComfort(strokes, target, config = {}) {
  return measureTrace(strokes, target, config, true);
}

// Protocol 6 also checks the direction of the curve. Crossing a nearby turn
// should not earn the same credit as following it. A short window along the
// drawn line smooths small wobbles; either tracing direction is allowed.
export function scoreTraceFollowing(strokes, target, config = {}) {
  return measureTrace(strokes, target, config, true, true);
}

const TRACE_DIRECTION_WINDOW = 0.03;
// Full direction credit within 15 degrees, falling to zero at 45 degrees.
const TRACE_FULL_DIRECTION_COS = Math.cos(Math.PI / 12);
const TRACE_ZERO_DIRECTION_COS = Math.cos(Math.PI / 4);

// Matching endpoints can share direction context, but real lift gaps stay separate.
function joinedTraceStrokes(strokes) {
  const joined = [];
  for (const stroke of strokes) {
    // Dots have no line length and must not change the smoothing context.
    if (!stroke.some((point) => point.x !== stroke[0].x || point.y !== stroke[0].y)) continue;
    const previous = joined[joined.length - 1];
    const end = previous?.[previous.length - 1];
    if (end && end.x === stroke[0].x && end.y === stroke[0].y) {
      for (const point of stroke) previous.push(point);
    } else {
      joined.push(stroke.slice());
    }
  }
  return joined;
}

function pointAtArc(stroke, arcs, arc) {
  if (arc <= 0) return stroke[0];
  if (arc >= arcs[arcs.length - 1]) return stroke[stroke.length - 1];
  let low = 1;
  let high = arcs.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (arcs[middle] <= arc) low = middle + 1;
    else high = middle;
  }
  const from = stroke[low - 1];
  const to = stroke[low];
  const fraction = (arc - arcs[low - 1]) / (arcs[low] - arcs[low - 1]);
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function traceDirection(stroke, arcs, arc, from, to) {
  const before = pointAtArc(stroke, arcs, arc - TRACE_DIRECTION_WINDOW);
  const after = pointAtArc(stroke, arcs, arc + TRACE_DIRECTION_WINDOW);
  let dx = after.x - before.x;
  let dy = after.y - before.y;
  let length = Math.hypot(dx, dy);
  if (length < 1e-12) {
    // A reversal or closed stroke can have coincident window endpoints.
    dx = to.x - from.x;
    dy = to.y - from.y;
    length = Math.hypot(dx, dy);
  }
  return { x: dx / length, y: dy / length };
}

function measureTrace(strokes, target, config, comfortable, followCurve = false) {
  let inputOk =
    Array.isArray(strokes) &&
    Array.isArray(target) &&
    target.length >= 2 &&
    target.length <= 10000 &&
    target.every(isPoint);
  if (inputOk) {
    for (const stroke of strokes) {
      if (!Array.isArray(stroke) || !stroke.every(isPoint)) {
        inputOk = false;
        break;
      }
    }
  }
  if (!inputOk) {
    throw new Error('A trace and target path with finite coordinates are required.');
  }

  const raw = strokes.flat();
  if (raw.length > 100000) {
    throw new Error(TOO_LONG);
  }

  const radius = SPIRAL_GUIDE_WIDTH / 2;

  // precompute target segments and their bounding boxes
  const segments = [];
  let targetLength = 0;
  for (let i = 1; i < target.length; i++) {
    const a = target[i - 1];
    const b = target[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    if (length) {
      segments.push({
        a: a,
        dx: dx,
        dy: dy,
        lengthSquared: lengthSquared,
        length: length,
        arc: targetLength,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      });
    }
    targetLength += length;
  }
  if (!Number.isFinite(targetLength) || !targetLength) {
    throw new Error('The target path must have a finite length.');
  }

  let drawnLength = 0;
  for (const stroke of strokes) {
    drawnLength += strokeLength(stroke);
  }
  if (!Number.isFinite(drawnLength) || drawnLength > 50) {
    throw new Error(TOO_LONG);
  }

  let earnedLength = 0;
  let measuredLength = 0;
  let distanceSum = 0;
  const bins = new Set();

  const measuredStrokes = followCurve ? joinedTraceStrokes(strokes) : strokes;
  for (const stroke of measuredStrokes) {
    const arcs = [0];
    if (followCurve) {
      for (let i = 1; i < stroke.length; i++) {
        arcs.push(arcs[arcs.length - 1] + distance(stroke[i - 1], stroke[i]));
      }
    }
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      const length = distance(a, b);
      if (!length) continue;

      const pieces = Math.ceil(length / SPIRAL_MEASUREMENT_STEP);
      const weight = length / pieces;

      for (let j = 0; j < pieces; j++) {
        const fraction = (j + 0.5) / pieces;
        const x = a.x + (b.x - a.x) * fraction;
        const y = a.y + (b.y - a.y) * fraction;

        let nearestSquared = Infinity;
        let arc = 0;
        let tangent = null;
        for (const segment of segments) {
          // skip a segment only if its box is already further away than the best so far
          const boxX = Math.max(segment.minX - x, 0, x - segment.maxX);
          const boxY = Math.max(segment.minY - y, 0, y - segment.maxY);
          if (boxX * boxX + boxY * boxY >= nearestSquared) continue;

          let part =
            ((x - segment.a.x) * segment.dx + (y - segment.a.y) * segment.dy) /
            segment.lengthSquared;
          part = Math.max(0, Math.min(1, part));

          const ex = x - segment.a.x - part * segment.dx;
          const ey = y - segment.a.y - part * segment.dy;
          const squared = ex * ex + ey * ey;
          if (squared < nearestSquared) {
            nearestSquared = squared;
            arc = segment.arc + part * segment.length;
            if (followCurve) tangent = segment;
          }
        }

        // tiny floating point leftovers (way under a pixel) count as zero
        let nearest = Math.sqrt(nearestSquared);
        if (nearestSquared < 1e-24) {
          nearest = 0;
        }

        let credit = comfortable
          ? Math.max(0, Math.min(1, 1 - (nearest - radius) / (SPIRAL_COMFORT_DISTANCE - radius)))
          : Math.max(0, 1 - nearest / radius);
        if (followCurve && credit > 0) {
          const direction = traceDirection(stroke, arcs, arcs[i - 1] + fraction * length, a, b);
          const alignment = Math.abs(
            (direction.x * tangent.dx + direction.y * tangent.dy) / tangent.length,
          );
          const directionCredit = Math.max(
            0,
            Math.min(
              1,
              (alignment - TRACE_ZERO_DIRECTION_COS) /
                (TRACE_FULL_DIRECTION_COS - TRACE_ZERO_DIRECTION_COS),
            ),
          );
          credit *= directionCredit;
        }
        earnedLength += credit * weight;
        measuredLength += weight;
        distanceSum += nearest * weight;
        if (nearest <= radius) {
          bins.add(Math.min(99, Math.floor((arc / targetLength) * 100)));
        }
      }
    }
  }

  const uniquePointCount = countUniquePoints(raw);
  const issues = [];
  if (uniquePointCount < 2 || drawnLength < 0.002) {
    issues.push('Draw a short line before selecting Finish.');
  }
  const speeds = traceSpeeds(strokes);
  const targetEnd = target[target.length - 1];

  return {
    metrics: {
      accuracyPct: ratio(earnedLength, measuredLength),
      meanDistancePctWidth: measuredLength ? (distanceSum / measuredLength) * 100 : null,
      coveragePct: bins.size,
      speedCV: speeds.length >= 10 ? variation(speeds) : null,
      completionSeconds: completionSeconds(config.durationMs),
    },
    quality: {
      issues: raw.length ? [] : ['No drawing was recorded.'],
      sampleCount: raw.length,
      uniquePointCount: uniquePointCount,
      speedIntervalCount: speeds.length,
    },
    validity: {
      valid: issues.length === 0,
      issues: issues,
      startedAtStart: raw.length > 0 && distance(raw[0], target[0]) <= 0.05,
      reachedEnd: raw.some((point) => distance(point, targetEnd) <= 0.05),
    },
  };
}

export function scoreTap(hitTimes, attempts, durationMs = 10000) {
  if (!(durationMs > 0) || !Number.isFinite(durationMs)) {
    throw new Error('A positive duration is required.');
  }

  const unique = new Set();
  for (const time of hitTimes) {
    if (Number.isFinite(time) && time >= 0 && time < durationMs) {
      unique.add(time);
    }
  }
  const times = Array.from(unique).sort((a, b) => a - b);
  const totalAttempts = Math.max(times.length, countAttempts(attempts));

  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > 0) {
      gaps.push(gap);
    }
  }

  return {
    metrics: {
      accuracyPct: ratio(times.length, totalAttempts),
      tapsPerSecond: times.length / (durationMs / 1000),
      rhythmCV: times.length >= 4 ? variation(gaps) : null,
      hitCount: times.length,
      missCount: totalAttempts - times.length,
      completionSeconds: durationMs / 1000,
    },
    quality: {
      issues: totalAttempts ? [] : ['No taps were recorded. Accuracy is not available.'],
      attemptCount: totalAttempts,
    },
    validity: { valid: true, issues: [] },
  };
}

function isTimedEvent(event) {
  return (
    Number.isFinite(event.appearedAt) &&
    Number.isFinite(event.selectedAt) &&
    event.selectedAt >= event.appearedAt
  );
}

function acquisitionTimes(events) {
  return events.map((event) => event.selectedAt - event.appearedAt);
}

// targetEvents has one entry per tile that was placed. missed drops still count as attempts
export function scoreAim(targetEvents, attempts, config = {}) {
  let expectedRounds = config.expectedRounds;
  if (expectedRounds === undefined || expectedRounds === null) {
    expectedRounds = 8;
  }

  const successful = targetEvents.filter(isTimedEvent);
  const attemptCount = Math.max(successful.length, countAttempts(attempts));
  const allPlaced = successful.length === expectedRounds;

  return {
    metrics: {
      accuracyPct: ratio(successful.length, attemptCount),
      hitCount: successful.length,
      missCount: attemptCount - successful.length,
      medianAcquisitionMs: median(acquisitionTimes(successful)),
      completionSeconds: completionSeconds(config.durationMs),
    },
    quality: {
      issues: attemptCount ? [] : ['No drops were recorded. Accuracy is not available.'],
      attemptCount: attemptCount,
    },
    validity: {
      valid: allPlaced,
      issues: allPlaced ? [] : ['Place all 8 tiles to finish.'],
    },
  };
}

// timed drag game. the order matters because a miss can't push the score under 0
export function scoreDrag(dropAttempts, config = {}) {
  let durationMs = config.durationMs;
  if (durationMs === undefined || durationMs === null) {
    durationMs = 30000;
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('A positive duration is required.');
  }

  const attempts = dropAttempts.filter(
    (event) => typeof event.hit === 'boolean' && isTimedEvent(event),
  );
  const successful = attempts.filter((event) => event.hit);

  let scorePoints = 0;
  for (const event of attempts) {
    if (event.hit) {
      scorePoints = scorePoints + 100;
    } else {
      scorePoints = Math.max(0, scorePoints - 25);
    }
  }

  return {
    metrics: {
      scorePoints: scorePoints,
      accuracyPct: ratio(successful.length, attempts.length),
      hitCount: successful.length,
      missCount: attempts.length - successful.length,
      medianAcquisitionMs: median(acquisitionTimes(successful)),
      completionSeconds: durationMs / 1000,
    },
    quality: {
      issues: attempts.length ? [] : ['No drops were recorded. Accuracy is not available.'],
      attemptCount: attempts.length,
    },
    validity: { valid: true, issues: [] },
  };
}

// integral of the distance |a + (b - a)s| for s from 0 to 1
function movingDistanceIntegral(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const squaredSpeed = dx * dx + dy * dy;
  if (squaredSpeed < 1e-20) {
    return Math.hypot(a.x, a.y);
  }
  const h = (a.x * dx + a.y * dy) / squaredSpeed;
  const q = Math.max(0, (a.x * a.x + a.y * a.y) / squaredSpeed - h * h);

  function primitive(value) {
    if (q < 1e-16) {
      return (value * Math.abs(value)) / 2;
    }
    return (value * Math.sqrt(value * value + q) + q * Math.asinh(value / Math.sqrt(q))) / 2;
  }

  return Math.max(0, Math.sqrt(squaredSpeed) * (primitive(1 + h) - primitive(h)));
}

// fraction of s in 0..1 where |a + (b - a)s| <= radius (solves the quadratic)
function movingInsideFraction(a, b, radius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (a.x * dx + a.y * dy);
  const C = a.x * a.x + a.y * a.y - radius * radius;
  if (A < 1e-20) {
    return C <= 0 ? 1 : 0;
  }
  const discriminant = B * B - 4 * A * C;
  if (discriminant <= 0) {
    return 0;
  }
  const root = Math.sqrt(discriminant);
  const exit = Math.min(1, (-B + root) / (2 * A));
  const enter = Math.max(0, (-B - root) / (2 * A));
  return Math.max(0, exit - enter);
}

function holdInterval(interval) {
  let start = interval.start;
  if (start === undefined || start === null) {
    start = interval.startedAt;
  }
  let end = interval.end;
  if (end === undefined || end === null) {
    let durationMs = interval.durationMs;
    if (durationMs === undefined || durationMs === null) {
      durationMs = 10000;
    }
    end = start + durationMs;
  }
  return { start: start, end: end };
}

function sortObservations(observations) {
  const list = [];
  for (const point of observations) {
    if (isPoint(point) && Number.isFinite(point.t)) {
      list.push(point);
    }
  }
  const ordered = list.map((point, index) => Object.assign({}, point, { index: index }));
  ordered.sort((a, b) => a.t - b.t || a.index - b.index);
  return ordered;
}

function isValidPath(path, duration) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 1000) {
    return false;
  }
  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    if (!isPoint(point) || !Number.isFinite(point.t)) {
      return false;
    }
    if (i > 0 && !(point.t > path[i - 1].t)) {
      return false;
    }
  }
  if (path[0].t > 0) {
    return false;
  }
  if (path[path.length - 1].t < duration) {
    return false;
  }
  return true;
}

function holdResult(insideMs, outsideMs, drift, observedMs, start, end, timeInsidePct) {
  const complete = observedMs >= end - start - 0.001;
  const issues = complete ? [] : ['The full cursor position was not recorded.'];
  return {
    metrics: {
      accuracyPct: timeInsidePct,
      observedDriftPctWidth: observedMs ? (drift / observedMs) * 100 : null,
      timeInsidePct: timeInsidePct,
      outsideSurfaceSeconds: outsideMs / 1000,
      completionSeconds: (end - start) / 1000,
    },
    quality: {
      issues: issues,
      observedMs: observedMs,
    },
    validity: {
      valid: complete,
      issues: complete ? [] : ['The full cursor position was not recorded.'],
    },
  };
}

// works out exactly how long the cursor was inside the moving ring, one straight path piece at a time
export function scoreMovingHold(observations, interval, geometry = {}) {
  const times = holdInterval(interval);
  const start = times.start;
  const end = times.end;

  let path = geometry.path;
  if (path === undefined || path === null) {
    path = HOLD_PATH;
  }
  let radius = geometry.radius;
  if (radius === undefined || radius === null) {
    radius = 32 / 480;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !isValidPath(path, end - start)
  ) {
    throw new Error('A valid moving-ring interval and path are required.');
  }

  const ordered = sortObservations(observations);
  let current = null;
  let cursor = start;
  let insideMs = 0;
  let outsideMs = 0;
  let drift = 0;
  let observedMs = 0;

  function accumulate(until) {
    const boundary = Math.min(end, until);
    if (boundary <= cursor) return;

    if (current) {
      // split the time at every corner of the ring's path
      const breaks = [cursor];
      for (const point of path) {
        const time = start + point.t;
        if (time > cursor && time < boundary) {
          breaks.push(time);
        }
      }
      breaks.push(boundary);

      for (let i = 1; i < breaks.length; i++) {
        const first = breaks[i - 1];
        const last = breaks[i];
        const duration = last - first;
        const from = holdCenterAt(first - start, path);
        const to = holdCenterAt(last - start, path);
        const a = { x: current.x - from.x, y: current.y - from.y };
        const b = { x: current.x - to.x, y: current.y - to.y };

        drift += movingDistanceIntegral(a, b) * duration;
        observedMs += duration;
        if (current.inSurface !== false) {
          insideMs += movingInsideFraction(a, b, radius) * duration;
        } else {
          outsideMs += duration;
        }
      }
    }
    cursor = boundary;
  }

  for (const observation of ordered) {
    if (observation.t <= start) {
      current = observation;
      continue;
    }
    if (observation.t > end) break;
    accumulate(observation.t);
    current = observation;
  }
  accumulate(end);

  let timeInsidePct = null;
  if (observedMs >= end - start - 0.001) {
    timeInsidePct = Math.min(100, Math.max(0, (insideMs / (end - start)) * 100));
  }
  return holdResult(insideMs, outsideMs, drift, observedMs, start, end, timeInsidePct);
}

// the last known position is kept until the next observation comes in
export function scoreHold(observations, interval, geometry = {}) {
  const times = holdInterval(interval);
  const start = times.start;
  const end = times.end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('A valid hold interval is required.');
  }

  let center = geometry.center;
  if (center === undefined || center === null) {
    center = { x: 0.5, y: 0.5 };
  }
  let radius = geometry.radius;
  if (radius === undefined || radius === null) {
    radius = 32 / 480;
  }

  const ordered = sortObservations(observations);
  let current = null;
  let cursor = start;
  let insideMs = 0;
  let outsideMs = 0;
  let drift = 0;
  let observedMs = 0;

  function accumulate(until) {
    const duration = Math.max(0, Math.min(end, until) - cursor);
    if (duration && current) {
      const inSurface = current.inSurface !== false;
      const d = distance(current, center);
      drift += d * duration;
      observedMs += duration;
      if (inSurface && d <= radius) {
        insideMs += duration;
      }
      if (!inSurface) {
        outsideMs += duration;
      }
    }
    cursor = Math.min(end, Math.max(cursor, until));
  }

  for (const observation of ordered) {
    if (observation.t <= start) {
      current = observation;
      continue;
    }
    if (observation.t > end) break;
    accumulate(observation.t);
    current = observation;
  }
  accumulate(end);

  let timeInsidePct = null;
  if (observedMs >= end - start - 0.001) {
    timeInsidePct = (insideMs / (end - start)) * 100;
  }
  return holdResult(insideMs, outsideMs, drift, observedMs, start, end, timeInsidePct);
}

export function compareMetric(value, baselineValue, unit) {
  if (!Number.isFinite(value) || !Number.isFinite(baselineValue)) {
    return { absoluteChange: null, percentChange: null };
  }
  let percentChange = null;
  if (baselineValue !== 0 && unit !== '%' && unit !== 'percentage points') {
    percentChange = ((value - baselineValue) / Math.abs(baselineValue)) * 100;
  }
  return {
    absoluteChange: value - baselineValue,
    percentChange: percentChange,
  };
}
