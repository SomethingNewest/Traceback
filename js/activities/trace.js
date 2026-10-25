import { SPIRAL_POINTS, isPrimaryActivation } from './protocol.js';
import { scoreTraceComfort } from '../metrics/scoring.js';
import { bindInputReset } from './extra-protocol.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function mountTrace(scope) {
  const surface = scope.surface;
  const signal = scope.signal;
  const ink = surface.querySelector('.trace-ink');

  // in forced-colors mode the surface gets a border, so measure from the svg
  // itself or the border would count as part of the drawing
  let drawing = surface.querySelector('svg');
  if (!drawing) {
    drawing = surface;
  }

  let pointerType = scope.pointerType;
  if (pointerType === undefined || pointerType === null) {
    pointerType = 'mouse';
  }

  const strokes = [];
  let activePointer = null;
  let stroke = null;
  let polyline = null;
  let startedAt = null;
  let finished = false;
  let recordedPoints = 0;
  let recordedLength = 0;

  function positionOf(event) {
    const rect = drawing.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function addPoint(event, time) {
    if (time === undefined) {
      time = scope.now();
    }
    if (finished) return;

    const pos = positionOf(event);
    const point = { x: pos.x, y: pos.y, t: time };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.t)) return;

    const last = stroke.length > 0 ? stroke[stroke.length - 1] : null;
    if (last && point.t < last.t) return;
    if (last) {
      recordedLength += Math.hypot(point.x - last.x, point.y - last.y);
    }

    recordedPoints++;
    if (recordedPoints > 100000 || recordedLength > 50) {
      finished = true;
      scope.interrupt(
        'This drawing reached the size limit. Start a new drawing when you are ready.',
      );
      return;
    }
    stroke.push(point);
  }

  function drawStroke() {
    const coords = [];
    for (const point of stroke) {
      coords.push(point.x * 1000 + ',' + point.y * 1000);
    }
    polyline.setAttribute('points', coords.join(' '));
  }

  surface.addEventListener(
    'pointerdown',
    function (event) {
      if (finished || !isPrimaryActivation(event, pointerType) || activePointer !== null) return;
      event.preventDefault();

      if (startedAt === null || startedAt === undefined) {
        startedAt = scope.now();
      }
      activePointer = event.pointerId;

      // every new stroke gets its own polyline
      polyline = document.createElementNS(SVG_NS, 'polyline');
      ink.append(polyline);
      stroke = [];
      strokes.push(stroke);

      addPoint(event);
      if (finished || signal.aborted) return;
      drawStroke();
      surface.setPointerCapture(event.pointerId);
      scope.feedback('You can lift and continue, or select Finish when you are ready.');
    },
    { signal: signal },
  );

  surface.addEventListener(
    'pointermove',
    function (event) {
      if (
        event.pointerId !== activePointer ||
        event.pointerType !== pointerType ||
        !event.isPrimary
      )
        return;
      if (['mouse', 'pen'].includes(pointerType) && event.buttons === 0) {
        cancelStroke(event);
        return;
      }
      event.preventDefault();
      const time = scope.now();

      // use the coalesced events too so fast movement doesn't lose points
      let samples = [];
      if (typeof event.getCoalescedEvents === 'function') {
        samples = event.getCoalescedEvents();
      }
      const sorted = Array.from(samples).sort((a, b) => a.timeStamp - b.timeStamp);
      for (const sample of sorted) {
        let sampleTime = time;
        if (Number.isFinite(sample.timeStamp) && Number.isFinite(event.timeStamp)) {
          sampleTime = time + sample.timeStamp - event.timeStamp;
        }
        if (sampleTime >= startedAt && sampleTime <= time) {
          addPoint(sample, sampleTime);
          if (finished || signal.aborted) return;
        }
      }

      addPoint(event, time);
      if (finished || signal.aborted) return;
      drawStroke();
    },
    { signal: signal },
  );

  surface.addEventListener(
    'pointerup',
    function (event) {
      if (event.pointerId !== activePointer) return;
      addPoint(event);
      if (finished || signal.aborted) return;
      drawStroke();
      activePointer = null;
      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
    },
    { signal: signal },
  );

  function cancelStroke(event) {
    if (activePointer === null || event.pointerId !== activePointer) return;
    activePointer = null;
    if (surface.hasPointerCapture(event.pointerId)) {
      surface.releasePointerCapture(event.pointerId);
    }
    scope.feedback('You can lift and continue, or select Finish when you are ready.');
  }
  surface.addEventListener('pointercancel', cancelStroke, { signal: signal });
  surface.addEventListener('lostpointercapture', cancelStroke, { signal: signal });
  bindInputReset(scope, () => cancelStroke({ pointerId: activePointer }));

  const finishButton = scope.panel.querySelector('#finish-practice');
  finishButton.hidden = false;
  finishButton.addEventListener(
    'click',
    function () {
      if (finished || activePointer !== null) return;

      let durationMs = 0;
      if (startedAt !== null) {
        durationMs = Math.max(1, scope.now() - startedAt);
      }

      let result;
      try {
        result = scoreTraceComfort(strokes, SPIRAL_POINTS, { durationMs: durationMs });
      } catch (error) {
        finished = true;
        scope.interrupt(error.message);
        return;
      }

      if (!result.validity.valid) {
        scope.feedback(result.validity.issues.join(' '));
        return;
      }

      finished = true;
      scope.complete({
        metrics: result.metrics,
        quality: result.quality,
        durationMs: durationMs,
        pointerType: pointerType,
      });
    },
    { signal: signal },
  );

  scope.status('Follow the spiral for as far as you want.');
  scope.feedback(
    'Aim for the middle of the guide. The closer your line stays, the higher your accuracy. Select Finish when you are ready.',
  );
  scope.timer('No time limit');
}
