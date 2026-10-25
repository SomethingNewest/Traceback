// Layout and timing for the games. Nothing in here does any scoring.

function frozenPoint(x, y) {
  return Object.freeze([x, y]);
}

export const AIM_POSITIONS = Object.freeze([
  frozenPoint(0.2, 0.2),
  frozenPoint(0.8, 0.7),
  frozenPoint(0.3, 0.8),
  frozenPoint(0.75, 0.25),
  frozenPoint(0.5, 0.5),
  frozenPoint(0.2, 0.65),
  frozenPoint(0.8, 0.45),
  frozenPoint(0.4, 0.2),
  frozenPoint(0.65, 0.8),
  frozenPoint(0.2, 0.4),
  frozenPoint(0.8, 0.8),
  frozenPoint(0.5, 0.3),
]);

function dragRound(fromX, fromY, toX, toY) {
  return Object.freeze({
    from: Object.freeze({ x: fromX, y: fromY }),
    to: Object.freeze({ x: toX, y: toY }),
  });
}

// drag rounds are always the same so runs can be compared
export const DRAG_ROUNDS = Object.freeze([
  dragRound(0.22, 0.25, 0.75, 0.72),
  dragRound(0.75, 0.25, 0.23, 0.72),
  dragRound(0.22, 0.5, 0.76, 0.5),
  dragRound(0.5, 0.23, 0.5, 0.76),
  dragRound(0.75, 0.72, 0.23, 0.25),
  dragRound(0.23, 0.72, 0.75, 0.25),
  dragRound(0.76, 0.5, 0.22, 0.5),
  dragRound(0.5, 0.76, 0.5, 0.23),
]);

function buildSpiral() {
  const points = [];
  for (let i = 0; i < 1600; i++) {
    const theta = (i / 1599) * 8 * Math.PI;
    const r = 0.06 + (0.36 * i) / 1599;
    points.push(Object.freeze({ x: 0.5 + r * Math.cos(theta), y: 0.5 + r * Math.sin(theta) }));
  }
  return Object.freeze(points);
}

export const SPIRAL_POINTS = buildSpiral();

// Shared by the drawing code and trace scorers. Coordinates are 0-1 in the
// square game area, the svg uses a 1000 unit viewBox.
export const SPIRAL_GUIDE_WIDTH = 0.014;
export const SPIRAL_MEASUREMENT_STEP = 0.0005;
// Protocol 5 allows small wobbles: full credit within the guide, then a gradual
// falloff to this distance from its middle. The drawing itself stays unchanged.
export const SPIRAL_COMFORT_DISTANCE = 0.035;

// The tap target follows the same route every time. It stays inside the area
// including its radius and outline.
export function movingTargetPosition(elapsedMs, width, height, diameter) {
  const allFinite =
    Number.isFinite(elapsedMs) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    Number.isFinite(diameter);
  if (!allFinite || width <= diameter || height <= diameter || diameter <= 0) {
    throw new Error('The task area is too small for this target.');
  }

  const margin = diameter / 2 + Math.min(14, (Math.min(width, height) - diameter) / 4);
  const time = Math.max(0, elapsedMs);
  return {
    x: width / 2 + (width / 2 - margin) * Math.sin((time / 6400) * Math.PI * 2),
    y: height / 2 + (height / 2 - margin) * Math.sin((time / 8600) * Math.PI * 2),
  };
}

function holdPoint(t, x, y) {
  return Object.freeze({ t: t, x: x, y: y });
}

// straight line pieces so time inside the ring can be worked out exactly,
// no matter what the frame rate is
export const HOLD_PATH = Object.freeze([
  holdPoint(0, 0.5, 0.5),
  holdPoint(2000, 0.62, 0.42),
  holdPoint(4000, 0.64, 0.6),
  holdPoint(6000, 0.4, 0.63),
  holdPoint(8000, 0.36, 0.4),
  holdPoint(10000, 0.5, 0.5),
]);

export function holdCenterAt(elapsedMs, path = HOLD_PATH) {
  const last = path[path.length - 1];
  const time = Math.max(path[0].t, Math.min(last.t, elapsedMs));

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (time <= b.t) {
      const part = (time - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * part, y: a.y + (b.y - a.y) * part };
    }
  }
  return { x: last.x, y: last.y };
}

export function targetPosition(index, width, height, diameter) {
  const point = AIM_POSITIONS[index];
  if (!point || width < diameter || height < diameter) {
    throw new Error('The task area is too small for this target.');
  }
  const radius = diameter / 2;
  return {
    x: Math.max(radius, Math.min(width - radius, point[0] * width)),
    y: Math.max(radius, Math.min(height - radius, point[1] * height)),
  };
}

export function isPrimaryActivation(event, pointerType = null) {
  if (event.isPrimary !== true || event.button !== 0) {
    return false;
  }
  if (
    event.pointerType !== 'mouse' &&
    event.pointerType !== 'touch' &&
    event.pointerType !== 'pen'
  ) {
    return false;
  }
  if (pointerType !== null && event.pointerType !== pointerType) {
    return false;
  }
  return true;
}

export function withinInterval(time, start, duration = 10000) {
  return Number.isFinite(time) && time >= start && time < start + duration;
}

// ready -> countdown (3s inside the ring) -> running (10s) -> complete
export function holdStage({ now, inside, readyAt, startedAt }) {
  if (startedAt !== null) {
    let state = 'running';
    if (now - startedAt >= 10000) {
      state = 'complete';
    }
    return { state: state, readyAt: readyAt, startedAt: startedAt };
  }

  if (!inside) {
    return { state: 'ready', readyAt: null, startedAt: null };
  }

  let began = readyAt;
  if (began === undefined || began === null) {
    began = now;
  }

  if (!(now - began >= 3000)) {
    return { state: 'countdown', readyAt: began, startedAt: null };
  }

  let state = 'running';
  if (now - began >= 13000) {
    state = 'complete';
  }
  return { state: state, readyAt: began, startedAt: began + 3000 };
}
