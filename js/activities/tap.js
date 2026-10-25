import { isPrimaryActivation, movingTargetPosition, withinInterval } from './protocol.js';
import { scoreTap } from '../metrics/scoring.js';
import { bindInputReset } from './extra-protocol.js';

export function mountTap(scope) {
  const startedAt = scope.now();
  let pointerType = scope.pointerType;
  if (pointerType === undefined || pointerType === null) {
    pointerType = 'mouse';
  }
  const target = scope.surface.querySelector('.activity-target');
  const diameter = scope.largerTargets ? 112 : 80;
  const durationMs = 10000;

  const hitTimes = [];
  const activePointers = new Set();
  let attempts = 0;
  let finished = false;

  function positionAt(time) {
    const rect = scope.surface.getBoundingClientRect();
    return movingTargetPosition(time - startedAt, rect.width, rect.height, diameter);
  }

  function draw(time) {
    const center = positionAt(time);
    target.style.left = center.x + 'px';
    target.style.top = center.y + 'px';
  }

  function releasePointer(event) {
    activePointers.delete(event.pointerId);
  }

  draw(startedAt);
  scope.status('Tap the moving circle for 10 seconds.');
  scope.feedback('0 hits');
  scope.timer('10s left');

  scope.surface.addEventListener(
    'pointerdown',
    function (event) {
      const time = scope.now();
      if (finished) return;
      if (!isPrimaryActivation(event, pointerType)) return;
      if (activePointers.size > 0) return;
      if (!withinInterval(time, startedAt, durationMs)) return;

      event.preventDefault();
      activePointers.add(event.pointerId);
      attempts++;

      // check against where the circle really is right now, the DOM might
      // still be showing last frame's position
      const center = positionAt(time);
      const rect = scope.surface.getBoundingClientRect();
      const dx = event.clientX - rect.left - center.x;
      const dy = event.clientY - rect.top - center.y;
      if (Math.hypot(dx, dy) <= diameter / 2) {
        hitTimes.push(time - startedAt);
      }

      draw(time);
      const misses = attempts - hitTimes.length;
      scope.feedback(hitTimes.length + ' hits - ' + misses + ' misses');
    },
    { signal: scope.signal },
  );

  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    scope.surface.addEventListener(event, releasePointer, { signal: scope.signal });
  }
  scope.surface.addEventListener(
    'pointermove',
    function (event) {
      if (['mouse', 'pen'].includes(event.pointerType) && event.buttons === 0)
        releasePointer(event);
    },
    { signal: scope.signal },
  );

  // the pointer can get released just outside the game area between taps
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerup', releasePointer, { signal: scope.signal });
    window.addEventListener('pointercancel', releasePointer, { signal: scope.signal });
  }
  bindInputReset(scope, () => activePointers.clear());

  scope.frame(function (time) {
    if (finished) return;

    const remaining = Math.min(durationMs, Math.max(0, durationMs - (time - startedAt)));
    draw(Math.min(time, startedAt + durationMs));
    scope.timer(Math.ceil(remaining / 1000) + 's left');

    if (remaining === 0) {
      finished = true;
      const result = scoreTap(hitTimes, attempts, durationMs);
      scope.complete({
        metrics: result.metrics,
        quality: result.quality,
        durationMs: durationMs,
        pointerType: pointerType,
      });
    }
  });
}
