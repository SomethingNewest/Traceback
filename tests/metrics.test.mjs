import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pointToSegmentDistance,
  resampleStroke,
  scoreTrace,
  scoreTraceAlignment,
  scoreTracePrecision,
  scoreTraceComfort,
  scoreTap,
  scoreAim,
  scoreDrag,
  scoreHold,
  scoreMovingHold,
  compareMetric,
} from '../js/metrics/scoring.js';
import {
  SPIRAL_POINTS,
  SPIRAL_GUIDE_WIDTH,
  SPIRAL_COMFORT_DISTANCE,
} from '../js/activities/protocol.js';

test('geometry projects, clamps endpoints and handles zero-length segments', () => {
  assert.deepEqual(pointToSegmentDistance({ x: 0.5, y: 0.2 }, { x: 0, y: 0 }, { x: 1, y: 0 }), {
    distance: 0.2,
    projectionT: 0.5,
  });
  assert.equal(pointToSegmentDistance({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }).distance, 1);
  assert.equal(pointToSegmentDistance({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }).distance, 1);
});
test('trace resampling rejects unsafe spacing or oversized paths before looping', () => {
  const stroke = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  for (const spacing of [0, -1, NaN, Infinity])
    assert.throws(() => resampleStroke(stroke, spacing), /spacing/);
  assert.throws(
    () =>
      resampleStroke([
        { x: 0, y: 0 },
        { x: 1e6, y: 0 },
      ]),
    /too long/,
  );
});
test('a complete exact spiral has near-zero error, full accuracy and enough coverage', () => {
  const result = scoreTrace(
    [SPIRAL_POINTS.map((point, i) => ({ ...point, t: i * 20 }))],
    SPIRAL_POINTS,
    { durationMs: 16000 },
  );
  assert.equal(result.validity.valid, true);
  assert.equal(result.metrics.accuracyPct, 100);
  assert.ok(result.metrics.meanDistancePctWidth < 1e-10);
  assert.ok(result.metrics.coveragePct >= 90);
  assert.equal(result.metrics.completionSeconds, 16);
  assert.ok(Number.isFinite(result.metrics.speedCV));
});
test('offset paths score less accurately and a central scribble cannot finish', () => {
  const shifted = scoreTrace(
    [SPIRAL_POINTS.map((point) => ({ x: point.x + 0.06, y: point.y }))],
    SPIRAL_POINTS,
  );
  assert.ok(shifted.metrics.accuracyPct < 100);
  assert.ok(shifted.metrics.meanDistancePctWidth > 0);
  const scribble = scoreTrace(
    [Array.from({ length: 60 }, (_, i) => ({ x: 0.56 + i * 0.00001, y: 0.5 }))],
    SPIRAL_POINTS,
  );
  assert.equal(scribble.validity.valid, false);
  assert.ok(scribble.metrics.coveragePct < 90);
  assert.equal(scribble.validity.reachedEnd, false);
});
test('lifts do not interpolate unvisited parts of the spiral', () => {
  const disconnected = scoreTrace([[SPIRAL_POINTS[0]], [SPIRAL_POINTS.at(-1)]], SPIRAL_POINTS);
  assert.ok(disconnected.metrics.coveragePct <= 2);
  assert.equal(disconnected.quality.uniquePointCount, 2);
  assert.equal(disconnected.validity.valid, false);
  assert.equal(
    resampleStroke([
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
    ]).length,
    6,
  );
});
test('trace with no drawing has no accuracy and cannot finish', () => {
  const result = scoreTrace([], SPIRAL_POINTS);
  assert.equal(result.metrics.accuracyPct, null);
  assert.equal(result.metrics.meanDistancePctWidth, null);
  assert.equal(result.validity.valid, false);
});

test('partial tracing scores alignment without requiring the start, end or full coverage', () => {
  const target = [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ];
  const result = scoreTraceAlignment(
    [
      [
        { x: 0.3, y: 0.5, t: 0 },
        { x: 0.35, y: 0.5, t: 100 },
      ],
    ],
    target,
    { durationMs: 100 },
  );
  assert.equal(result.validity.valid, true);
  assert.equal(result.validity.startedAtStart, false);
  assert.equal(result.validity.reachedEnd, false);
  assert.equal(result.metrics.accuracyPct, 100);
  assert.ok(result.metrics.coveragePct < 10);
  assert.equal(result.metrics.meanDistancePctWidth, 0);
});

test('whole-line alignment falls when the middle drifts even with exact endpoints', () => {
  const target = [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ];
  const result = scoreTraceAlignment(
    [
      [
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.7 },
        { x: 1, y: 0.5 },
      ],
    ],
    target,
  );
  assert.equal(result.validity.valid, true);
  assert.equal(result.validity.startedAtStart, true);
  assert.equal(result.validity.reachedEnd, true);
  assert.ok(result.metrics.accuracyPct < 50);
  assert.ok(result.metrics.meanDistancePctWidth > 0);
  const offGuide = scoreTraceAlignment(
    [
      [
        { x: 0.3, y: 0.6 },
        { x: 0.35, y: 0.6 },
      ],
    ],
    target,
  );
  assert.equal(offGuide.validity.valid, true);
  assert.equal(offGuide.metrics.accuracyPct, 0);
});

test('partial tracing still rejects empty drawings, dots and unconnected endpoint taps', () => {
  const target = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  for (const strokes of [
    [],
    [[{ x: 0, y: 0 }]],
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    ],
    [[{ x: 0, y: 0 }], [{ x: 1, y: 0 }]],
  ]) {
    const result = scoreTraceAlignment(strokes, target);
    assert.equal(result.validity.valid, false);
    assert.match(result.validity.issues[0], /short line/);
  }
});

test('dots and tiny strokes cannot inflate the accuracy of a longer off-guide line', () => {
  const target = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  const offGuide = [
    { x: 0.3, y: 0.2 },
    { x: 0.35, y: 0.2 },
  ];
  const dots = Array.from({ length: 100 }, () => [
    { x: 0.4, y: 0 },
    { x: 0.4, y: 0 },
  ]);
  assert.equal(scoreTraceAlignment([offGuide, ...dots], target).metrics.accuracyPct, 0);
  const tinyLines = Array.from({ length: 100 }, () => [
    { x: 0.4, y: 0 },
    { x: 0.400001, y: 0 },
  ]);
  const result = scoreTraceAlignment([offGuide, ...tinyLines], target);
  assert.equal(result.validity.valid, true);
  assert.ok(Math.abs(result.metrics.accuracyPct - (0.0001 / 0.0501) * 100) < 1e-6);
  assert.ok(result.metrics.accuracyPct < 0.3);
});

test('visible-guide precision gives proportional credit for known straight-line offsets', () => {
  const target = [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ],
    radius = SPIRAL_GUIDE_WIDTH / 2;
  for (const [offset, expected] of [
    [0, 100],
    [radius / 4, 75],
    [radius / 2, 50],
    [(radius * 3) / 4, 25],
    [radius, 0],
    [radius * 2, 0],
  ]) {
    const result = scoreTracePrecision(
      [
        [
          { x: 0.2, y: 0.5 + offset },
          { x: 0.3, y: 0.5 + offset },
        ],
      ],
      target,
    );
    assert.equal(result.validity.valid, true);
    assert.ok(Math.abs(result.metrics.accuracyPct - expected) < 1e-9);
    assert.ok(Math.abs(result.metrics.meanDistancePctWidth - offset * 100) < 1e-9);
  }
  // This visibly off-guide line previously received 100% under protocol 3.
  const visiblyOutside = [
    [
      { x: 0.2, y: 0.51 },
      { x: 0.3, y: 0.51 },
    ],
  ];
  assert.equal(scoreTraceAlignment(visiblyOutside, target).metrics.accuracyPct, 100);
  assert.equal(scoreTracePrecision(visiblyOutside, target).metrics.accuracyPct, 0);
});

test('comfortable tracing allows guide-width wobbles and gradually penalizes further offsets', () => {
  const target = [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ];
  const radius = SPIRAL_GUIDE_WIDTH / 2;
  const remainingBand = SPIRAL_COMFORT_DISTANCE - radius;
  for (const [offset, expected] of [
    [0, 100],
    [radius / 2, 100],
    [radius, 100],
    [radius + remainingBand / 4, 75],
    [radius + remainingBand / 2, 50],
    [SPIRAL_COMFORT_DISTANCE, 0],
    [SPIRAL_COMFORT_DISTANCE * 2, 0],
  ]) {
    const strokes = [
      [
        { x: 0.2, y: 0.5 + offset },
        { x: 0.3, y: 0.5 + offset },
      ],
    ];
    const current = scoreTraceComfort(strokes, target);
    assert.equal(current.validity.valid, true);
    assert.ok(Math.abs(current.metrics.accuracyPct - expected) < 1e-9);
    assert.ok(Math.abs(current.metrics.meanDistancePctWidth - offset * 100) < 1e-9);
    // Existing results keep their stricter protocol 4 meaning.
    const old = scoreTracePrecision(strokes, target);
    assert.ok(Math.abs(old.metrics.accuracyPct - Math.max(0, 1 - offset / radius) * 100) < 1e-9);
    assert.equal(current.metrics.coveragePct, old.metrics.coveragePct);
  }
});

test('comfortable tracing accepts a short spiral section and still measures middle detours', () => {
  const exact = scoreTraceComfort([SPIRAL_POINTS.slice(450, 470)], SPIRAL_POINTS);
  assert.equal(exact.validity.valid, true);
  assert.equal(exact.validity.startedAtStart, false);
  assert.equal(exact.validity.reachedEnd, false);
  assert.equal(exact.metrics.accuracyPct, 100);
  assert.ok(exact.metrics.coveragePct < 10);
  const detour = scoreTraceComfort(
    [
      [
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.7 },
        { x: 1, y: 0.5 },
      ],
    ],
    [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ],
  );
  assert.equal(detour.validity.startedAtStart, true);
  assert.equal(detour.validity.reachedEnd, true);
  assert.ok(detour.metrics.accuracyPct < 15);
  assert.ok(Math.abs(detour.metrics.meanDistancePctWidth - 10) < 1e-9);
  const shortcut = scoreTraceComfort(
    [
      [
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.8 },
      ],
    ],
    [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.2 },
      { x: 0.9, y: 0.8 },
      { x: 0.1, y: 0.8 },
    ],
  );
  assert.ok(shortcut.metrics.accuracyPct < 10);
});

test('comfortable accuracy is stable across input density and lifting without filling gaps', () => {
  const target = [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ];
  const from = { x: 0.1, y: 0.5 },
    to = { x: 0.9, y: 0.53 };
  const points = Array.from({ length: 801 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / 800,
    y: from.y + ((to.y - from.y) * i) / 800,
  }));
  const sparse = scoreTraceComfort([[from, to]], target);
  for (const strokes of [
    [points.flatMap((point) => [point, point])],
    [points.slice(0, 401), points.slice(400)],
  ]) {
    const result = scoreTraceComfort(strokes, target);
    assert.ok(Math.abs(result.metrics.accuracyPct - sparse.metrics.accuracyPct) < 0.001);
    assert.ok(
      Math.abs(result.metrics.meanDistancePctWidth - sparse.metrics.meanDistancePctWidth) < 1e-9,
    );
  }
  const separated = scoreTraceComfort(
    [
      [
        { x: 0.2, y: 0.5 },
        { x: 0.3, y: 0.5 },
      ],
      [
        { x: 0.2, y: 0.6 },
        { x: 0.3, y: 0.6 },
      ],
    ],
    target,
  );
  assert.ok(Math.abs(separated.metrics.accuracyPct - 50) < 1e-9);
  assert.ok(Math.abs(separated.metrics.meanDistancePctWidth - 5) < 1e-9);
});

test('comfortable tracing gives dots no weight and rejects empty or invalid drawings', () => {
  const target = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  const offGuide = [
    { x: 0.3, y: 0.2 },
    { x: 0.35, y: 0.2 },
  ];
  const dots = Array.from({ length: 100 }, () => [{ x: 0.4, y: 0 }]);
  assert.equal(scoreTraceComfort([offGuide, ...dots], target).metrics.accuracyPct, 0);
  const tinyLines = Array.from({ length: 100 }, () => [
    { x: 0.4, y: 0 },
    { x: 0.400001, y: 0 },
  ]);
  const result = scoreTraceComfort([offGuide, ...tinyLines], target);
  assert.ok(Math.abs(result.metrics.accuracyPct - (0.0001 / 0.0501) * 100) < 1e-8);
  for (const strokes of [[], [[{ x: 0, y: 0 }]], [[{ x: 0, y: 0 }], [{ x: 1, y: 0 }]]]) {
    const invalid = scoreTraceComfort(strokes, target);
    assert.equal(invalid.metrics.accuracyPct, null);
    assert.equal(invalid.validity.valid, false);
  }
  assert.throws(() => scoreTraceComfort([[{ x: NaN, y: 0 }]], target), /finite/);
  assert.throws(
    () =>
      scoreTraceComfort(
        [
          [
            { x: 0, y: 0 },
            { x: 51, y: 0 },
          ],
        ],
        target,
      ),
    /too long/,
  );
});

test('precision scores the entire path and exact spiral while keeping short sections valid', () => {
  const exact = scoreTracePrecision([SPIRAL_POINTS], SPIRAL_POINTS);
  assert.ok(Math.abs(exact.metrics.accuracyPct - 100) < 1e-9);
  assert.ok(exact.metrics.meanDistancePctWidth < 1e-10);
  const section = scoreTracePrecision([SPIRAL_POINTS.slice(450, 470)], SPIRAL_POINTS);
  assert.equal(section.validity.valid, true);
  assert.equal(section.validity.startedAtStart, false);
  assert.equal(section.validity.reachedEnd, false);
  assert.ok(Math.abs(section.metrics.accuracyPct - 100) < 1e-9);
  const bent = scoreTracePrecision(
    [
      [
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.55 },
        { x: 1, y: 0.5 },
      ],
    ],
    [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ],
  );
  assert.ok(Math.abs(bent.metrics.accuracyPct - 7) < 0.01);
  assert.ok(Math.abs(bent.metrics.meanDistancePctWidth - 2.5) < 1e-9);
});

test('precision is stable with pointer density, repeated events and lifts along the same drawing', () => {
  const target = [
      { x: 0, y: 0.5 },
      { x: 1, y: 0.5 },
    ],
    from = { x: 0.1, y: 0.5 },
    to = { x: 0.9, y: 0.52 };
  const sparse = scoreTracePrecision([[from, to]], target);
  const densePoints = Array.from({ length: 801 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / 800,
    y: from.y + ((to.y - from.y) * i) / 800,
  }));
  const dense = scoreTracePrecision([densePoints.flatMap((point) => [point, point])], target);
  const lifted = scoreTracePrecision([densePoints.slice(0, 401), densePoints.slice(400)], target);
  assert.ok(Math.abs(sparse.metrics.accuracyPct - dense.metrics.accuracyPct) < 0.001);
  assert.ok(Math.abs(sparse.metrics.accuracyPct - lifted.metrics.accuracyPct) < 0.001);
  assert.ok(
    Math.abs(sparse.metrics.meanDistancePctWidth - dense.metrics.meanDistancePctWidth) < 1e-10,
  );
});

test('precision weights real line length so taps, tiny strokes and extra events cannot add equal credit', () => {
  const target = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  const offGuide = [
      { x: 0.3, y: 0.2 },
      { x: 0.35, y: 0.2 },
    ],
    dots = Array.from({ length: 100 }, () => [{ x: 0.4, y: 0 }]);
  assert.equal(scoreTracePrecision([offGuide, ...dots], target).metrics.accuracyPct, 0);
  const tinyLines = Array.from({ length: 100 }, () => [
    { x: 0.4, y: 0 },
    { x: 0.400001, y: 0 },
  ]);
  assert.ok(
    Math.abs(
      scoreTracePrecision([offGuide, ...tinyLines], target).metrics.accuracyPct -
        (0.0001 / 0.0501) * 100,
    ) < 1e-8,
  );
  const weighted = scoreTracePrecision(
    [
      [
        { x: 0.1, y: 0 },
        { x: 0.4, y: 0 },
      ],
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.1 },
      ],
    ],
    target,
  );
  assert.ok(Math.abs(weighted.metrics.accuracyPct - 75) < 1e-9);
  assert.ok(Math.abs(weighted.metrics.meanDistancePctWidth - 2.5) < 1e-9);
});

test('precision does not fill lifted gaps or award shortcuts through neighboring turns', () => {
  const target = [
    { x: 0.1, y: 0.2 },
    { x: 0.9, y: 0.2 },
    { x: 0.9, y: 0.8 },
    { x: 0.1, y: 0.8 },
  ];
  const separate = scoreTracePrecision(
    [
      [
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.2 },
      ],
      [
        { x: 0.2, y: 0.8 },
        { x: 0.3, y: 0.8 },
      ],
    ],
    target,
  );
  assert.ok(Math.abs(separate.metrics.accuracyPct - 100) < 1e-9);
  const shortcut = scoreTracePrecision(
    [
      [
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.8 },
      ],
    ],
    target,
  );
  assert.ok(shortcut.metrics.accuracyPct < 2);
  // Distance must clamp to each finite segment's end, not its infinite line.
  const beyond = scoreTracePrecision(
    [
      [
        { x: 1.1, y: 0 },
        { x: 1.2, y: 0 },
      ],
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  );
  assert.equal(beyond.metrics.accuracyPct, 0);
  assert.ok(Math.abs(beyond.metrics.meanDistancePctWidth - 15) < 1e-9);
});

test('precision rejects dots, missing data, nonfinite paths and oversized traces safely', () => {
  const target = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  for (const strokes of [
    [],
    [[{ x: 0, y: 0 }]],
    [
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    ],
    [[{ x: 0, y: 0 }], [{ x: 1, y: 0 }]],
  ]) {
    const result = scoreTracePrecision(strokes, target);
    assert.equal(result.metrics.accuracyPct, null);
    assert.equal(result.validity.valid, false);
  }
  assert.throws(() => scoreTracePrecision([[{ x: NaN, y: 0 }]], target), /finite/);
  assert.throws(
    () =>
      scoreTracePrecision(
        [
          [
            { x: 0, y: 0 },
            { x: 1e6, y: 0 },
          ],
        ],
        target,
      ),
    /too long/,
  );
});
test('20 regular taps in 10 seconds score 2 taps/s; misses affect accuracy', () => {
  const result = scoreTap(
    Array.from({ length: 20 }, (_, i) => i * 500),
    25,
    10000,
  );
  assert.equal(result.metrics.tapsPerSecond, 2);
  assert.equal(result.metrics.rhythmCV, 0);
  assert.equal(result.metrics.accuracyPct, 80);
  assert.equal(result.metrics.missCount, 5);
});
test('tap excludes endpoint and duplicate timestamps, and zero attempts has no invented accuracy', () => {
  const result = scoreTap([0, 0, 200, 500, 1000, 10000, -1, NaN], 6, 10000);
  assert.equal(result.metrics.hitCount, 4);
  assert.ok(result.metrics.rhythmCV > 0);
  assert.equal(scoreTap([100, 200], 2, 10000).metrics.rhythmCV, null);
  const empty = scoreTap([], 0, 10000);
  assert.equal(empty.metrics.accuracyPct, null);
  assert.equal(empty.metrics.tapsPerSecond, 0);
  assert.equal(empty.validity.valid, true);
  assert.ok(empty.quality.issues.length);
});
test('drag placement accuracy counts all drops and requires every round', () => {
  const events = Array.from({ length: 8 }, (_, i) => ({
    appearedAt: i * 1000,
    selectedAt: i * 1000 + (i + 1) * 100,
  }));
  const result = scoreAim(events, 10, { durationMs: 9000 });
  assert.equal(result.metrics.accuracyPct, 80);
  assert.equal(result.metrics.medianAcquisitionMs, 450);
  assert.equal(result.metrics.completionSeconds, 9);
  assert.equal(result.validity.valid, true);
  assert.equal(scoreAim(events.slice(1), 9).validity.valid, false);
  assert.equal(scoreAim([], 0).metrics.accuracyPct, null);
});
test('timed drag score applies ordered penalties, never goes negative and retains accuracy', () => {
  const attempts = [false, true, false, false, false, false, false, true].map((hit, i) => ({
    hit,
    appearedAt: i * 1000,
    selectedAt: i * 1000 + 200,
  }));
  const result = scoreDrag(attempts);
  assert.equal(result.metrics.scorePoints, 100);
  assert.equal(result.metrics.accuracyPct, 25);
  assert.equal(result.metrics.hitCount, 2);
  assert.equal(result.metrics.missCount, 6);
  assert.equal(result.metrics.medianAcquisitionMs, 200);
  assert.equal(result.metrics.completionSeconds, 30);
  assert.equal(result.validity.valid, true);
  assert.equal(scoreDrag([], {}).metrics.scorePoints, 0);
  assert.equal(scoreDrag([]).metrics.accuracyPct, null);
});
test('hold integrates exact intervals, outside time, and clips late observations', () => {
  const result = scoreHold(
    [
      { x: 0.5, y: 0.5, t: 0 },
      { x: 0.7, y: 0.5, t: 2500 },
      { x: 1.1, y: 0.5, t: 7500, inSurface: false },
      { x: 0.5, y: 0.5, t: 12000 },
    ],
    { start: 0, durationMs: 10000 },
    { radius: 0.1 },
  );
  assert.equal(result.metrics.accuracyPct, 25);
  assert.equal(result.metrics.timeInsidePct, 25);
  assert.equal(result.metrics.outsideSurfaceSeconds, 2.5);
  assert.ok(Math.abs(result.metrics.observedDriftPctWidth - 25) < 1e-10);
});
test('stationary observed cursor remains observed; missing starting position gives no accuracy', () => {
  const stationary = scoreHold([{ x: 0.5, y: 0.5, t: 100 }], { start: 100, durationMs: 10000 });
  assert.equal(stationary.metrics.accuracyPct, 100);
  assert.equal(stationary.metrics.observedDriftPctWidth, 0);
  const missing = scoreHold([{ x: 0.5, y: 0.5, t: 1000 }], { start: 0, durationMs: 10000 });
  assert.equal(missing.metrics.accuracyPct, null);
  assert.equal(missing.validity.valid, false);
});
test('moving ring integrates exact crossing times for a stationary cursor without animation samples', () => {
  const path = [
    { t: 0, x: 0.25, y: 0.5 },
    { t: 10000, x: 0.75, y: 0.5 },
  ];
  const result = scoreMovingHold(
    [{ t: 0, x: 0.5, y: 0.5 }],
    { start: 0, durationMs: 10000 },
    { path, radius: 0.1 },
  );
  assert.ok(Math.abs(result.metrics.accuracyPct - 40) < 1e-10);
  assert.ok(Math.abs(result.metrics.observedDriftPctWidth - 12.5) < 1e-10);
  assert.equal(result.quality.observedMs, 10000);
  assert.equal(result.validity.valid, true);
  const outside = scoreMovingHold(
    [
      { t: 0, x: 0.5, y: 0.5 },
      { t: 5000, x: 0.5, y: 0.5, inSurface: false },
    ],
    { start: 0, durationMs: 10000 },
    { path, radius: 0.1 },
  );
  assert.ok(Math.abs(outside.metrics.accuracyPct - 20) < 1e-10);
  assert.equal(outside.metrics.outsideSurfaceSeconds, 5);
});
test('moving ring clips late samples, requires known start, and handles static or tangent segments', () => {
  const path = [
    { t: 0, x: 0.4, y: 0.5 },
    { t: 5000, x: 0.4, y: 0.5 },
    { t: 10000, x: 0.6, y: 0.5 },
  ];
  const known = scoreMovingHold(
    [
      { t: 90, x: 0.4, y: 0.5 },
      { t: 12000, x: 0.8, y: 0.8 },
    ],
    { start: 100, durationMs: 10000 },
    { path, radius: 0.05 },
  );
  assert.ok(Math.abs(known.metrics.accuracyPct - 62.5) < 1e-10);
  assert.equal(known.quality.observedMs, 10000);
  assert.equal(
    scoreMovingHold(
      [{ t: 1000, x: 0.4, y: 0.5 }],
      { start: 0, durationMs: 10000 },
      { path, radius: 0.05 },
    ).metrics.accuracyPct,
    null,
  );
  const tangent = scoreMovingHold(
    [{ t: 0, x: 0.5, y: 0.6 }],
    { start: 0, durationMs: 10000 },
    {
      path: [
        { t: 0, x: 0.25, y: 0.5 },
        { t: 10000, x: 0.75, y: 0.5 },
      ],
      radius: 0.1,
    },
  );
  assert.ok(tangent.metrics.accuracyPct < 1e-5);
});
test('comparison preserves signed values and handles percentage points and zero baselines', () => {
  assert.deepEqual(compareMetric(8, 10, 'ms'), { absoluteChange: -2, percentChange: -20 });
  assert.deepEqual(compareMetric(80, 60, '%'), { absoluteChange: 20, percentChange: null });
  assert.equal(compareMetric(3, 0, 'ms').percentChange, null);
  assert.equal(compareMetric(null, 2, 'ms').absoluteChange, null);
});
