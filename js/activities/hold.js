import { holdCenterAt, holdStage } from './protocol.js';
import { scoreMovingHold } from '../metrics/scoring.js';
import { bindInputReset } from './extra-protocol.js';

const HOLD_MS = 10000;
const COUNTDOWN_MS = 3000;

export function mountHold(scope) {
  const surface = scope.surface;
  const signal = scope.signal;
  const rect = surface.getBoundingClientRect();
  const radiusPx = scope.largerTargets ? 48 : 32;
  const radius = Math.min(radiusPx, rect.width / 2) / rect.width;
  const circle = surface.querySelector('.hold-circle');
  const observations = [];

  let current = null;
  let lastClient = null;
  let lastBounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  let finished = false;
  let lastTime = -Infinity;
  let stage = { state: 'ready', readyAt: null, startedAt: null };

  function pointFromClient(client, box, time) {
    const usable = box.width > 0 && box.height > 0;
    return {
      x: usable ? (client.clientX - box.left) / box.width : (current?.x ?? 0),
      y: usable ? (client.clientY - box.top) / box.height : (current?.y ?? 0),
      t: time,
      inSurface:
        client.inSurface &&
        usable &&
        client.clientX >= box.left &&
        client.clientX <= box.left + box.width &&
        client.clientY >= box.top &&
        client.clientY <= box.top + box.height,
    };
  }

  function updateGeometry(time) {
    const box = surface.getBoundingClientRect();
    if (
      box.left === lastBounds.left &&
      box.top === lastBounds.top &&
      box.width === lastBounds.width &&
      box.height === lastBounds.height
    )
      return;
    lastBounds = { left: box.left, top: box.top, width: box.width, height: box.height };
    if (!lastClient) return;

    // A stationary cursor stays at its client position when the game moves or
    // resizes. Record the change now without changing earlier measurements.
    const point = pointFromClient(lastClient, box, time);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    observations.push(point);
    current = point;
  }

  function isInside(center) {
    if (current === null || !current.inSurface) {
      return false;
    }
    return Math.hypot(current.x - center.x, current.y - center.y) <= radius;
  }

  // moves the circle and returns whether the cursor is inside it
  function render(time) {
    const size = surface.getBoundingClientRect();
    let center = { x: 0.5, y: 0.5 };
    if (stage.startedAt !== null) {
      center = holdCenterAt(time - stage.startedAt);
    }
    if (circle) {
      circle.style.left = center.x * size.width + 'px';
      circle.style.top = center.y * size.height + 'px';
      circle.style.width = radius * 2 * size.width + 'px';
      circle.style.height = radius * 2 * size.height + 'px';
      circle.dataset.inside = String(isInside(center));
    }
    return isInside(center);
  }

  function advance(time) {
    if (finished || time < lastTime) return;
    updateGeometry(time);
    lastTime = time;

    const previous = stage.state;
    stage = holdStage({
      now: time,
      inside: isInside({ x: 0.5, y: 0.5 }),
      readyAt: stage.readyAt,
      startedAt: stage.startedAt,
    });
    const inside = render(time);

    if (stage.state === 'complete') {
      finished = true;
      const result = scoreMovingHold(
        observations,
        { start: stage.startedAt, durationMs: HOLD_MS },
        { radius: radius },
      );
      scope.complete({
        metrics: result.metrics,
        quality: result.quality,
        durationMs: HOLD_MS,
        pointerType: 'mouse',
      });
      return;
    }

    if (stage.state === 'running') {
      if (previous !== 'running') {
        scope.status('Follow the moving circle with your cursor for 10 seconds.');
      }
      const left = Math.max(0, HOLD_MS - (time - stage.startedAt));
      scope.timer(Math.ceil(left / 1000) + 's left');
      scope.feedback(inside ? 'Cursor inside' : 'Move back into the circle.');
    } else if (stage.state === 'countdown') {
      const left = Math.max(0, COUNTDOWN_MS - (time - stage.readyAt));
      scope.timer('Starting in ' + Math.ceil(left / 1000));
      if (previous !== 'countdown') {
        scope.status('Keep your cursor here to start.');
      }
    } else {
      scope.timer('Ready');
      scope.feedback('Move your cursor into the circle.');
    }
  }

  function observe(event, inSurface) {
    if (finished || event.pointerType !== 'mouse' || !event.isPrimary) return;
    const time = scope.now();
    if (time < lastTime) return;

    // catch up on any time that already passed before we update the position
    advance(time);
    if (finished) return;

    const box = surface.getBoundingClientRect();
    const client = { clientX: event.clientX, clientY: event.clientY, inSurface: inSurface };
    const point = pointFromClient(client, box, time);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;

    lastClient = client;
    observations.push(point);
    current = point;
    advance(time);
  }

  surface.addEventListener(
    'pointermove',
    function (event) {
      observe(event, true);
    },
    { signal: signal },
  );
  surface.addEventListener(
    'pointerleave',
    function (event) {
      observe(event, false);
    },
    { signal: signal },
  );
  surface.addEventListener(
    'pointercancel',
    function (event) {
      observe(event, false);
    },
    { signal: signal },
  );
  bindInputReset(scope, function () {
    if (lastClient) {
      observe({ ...lastClient, pointerType: 'mouse', isPrimary: true }, false);
    }
  });

  scope.status('Move your mouse cursor into the circle.');
  scope.timer('Ready');
  scope.feedback('No clicking needed.');
  render(scope.now());
  scope.frame(advance);
}
