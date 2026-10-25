// list of all the games and their info
const activityList = [
  {
    id: 'trace',
    name: 'Spiral Trace',
    description: 'Trace as much of the spiral as you want.',
    duration: 'No time limit - finish when ready',
    input: 'Mouse, trackpad, touch or pen',
    status: 'ready',
    practice: true,
    practiceInstruction:
      'Follow the spiral guide. Small wobbles are okay. Select Finish whenever you are ready.',
    metricKey: 'meanDistancePctWidth',
    accuracyLabel: 'Line accuracy',
    accuracyDescription: traceAccuracyDescription(5),
    instructions: [
      'Begin near the Start dot in the center.',
      'Hold down and follow the dotted middle of the guide. You can lift and continue.',
      'Select Finish when you are ready. You do not need to reach End.',
    ],
    protocolVersion: 5,
    metricVersion: 2,
  },
  {
    id: 'tap',
    name: 'Target Tap',
    description: 'Tap the moving circle as many times as you can.',
    duration: '10 seconds',
    input: 'Mouse, trackpad, touch or pen',
    status: 'ready',
    practice: true,
    practiceInstruction: 'Follow the moving circle. Tap it until the time is up.',
    metricKey: 'tapsPerSecond',
    accuracyLabel: 'Tap accuracy',
    accuracyDescription: 'Taps that hit the moving circle, divided by all taps.',
    instructions: [
      'Tap or click the moving circle.',
      'Follow it as it moves around the game area.',
      'The game ends after 10 seconds.',
    ],
    protocolVersion: 2,
    metricVersion: 2,
  },
  {
    id: 'aim',
    name: 'Drag & Place',
    description: 'Place blocks in the box to earn points.',
    duration: '30 seconds',
    input: 'Mouse, trackpad, touch or pen',
    status: 'ready',
    practice: true,
    practiceInstruction: 'Drag each block into the box. Earn 100 points for each one.',
    metricKey: 'scorePoints',
    accuracyLabel: 'Drop accuracy',
    accuracyDescription: 'Drops inside the box, divided by all drop attempts.',
    instructions: [
      'Hold the solid block. Move it fully inside the outlined box, then let go.',
      'Each good drop adds 100 points. A missed drop takes away 25 points. Your score cannot go below 0.',
      'Place as many blocks as you can in 30 seconds.',
    ],
    protocolVersion: 3,
    metricVersion: 2,
  },
  {
    id: 'hold',
    name: 'Steady Ring',
    description: 'Follow the moving ring with your pointer.',
    duration: '10 seconds',
    input: 'Mouse or trackpad',
    status: 'ready',
    practice: true,
    practiceInstruction: 'Move into the ring. After the countdown, follow it without clicking.',
    metricKey: 'observedDriftPctWidth',
    accuracyLabel: 'Time in ring',
    accuracyDescription: 'Time inside the moving ring, divided by the 10-second game.',
    instructions: [
      'Move your pointer inside the ring.',
      'Wait for the countdown. You do not need to click.',
      'Follow the ring for 10 seconds. Try to stay inside.',
    ],
    protocolVersion: 2,
    metricVersion: 2,
  },
  {
    id: 'sequence',
    name: 'Number Trail',
    description: 'Find the numbers from 1 to 6 in order.',
    duration: 'No time limit - 6 numbers',
    input: 'Mouse, trackpad, touch or pen',
    status: 'ready',
    practice: true,
    practiceInstruction: 'Select 1, then 2. Keep going until you reach 6.',
    metricKey: 'accuracyPct',
    accuracyLabel: 'Number accuracy',
    accuracyDescription: 'Correct numbers, divided by all number selections.',
    instructions: [
      'Find and select 1.',
      'Select the next number each time: 2, 3, 4, 5, then 6.',
      'A wrong selection stays in place. Try the number shown above the game.',
    ],
    protocolVersion: 1,
    metricVersion: 2,
  },
  {
    id: 'memory',
    name: 'Match Pairs',
    description: 'Turn over cards to find three matching pairs.',
    duration: 'No time limit - 3 pairs',
    input: 'Mouse, trackpad, touch or pen',
    status: 'ready',
    practice: true,
    practiceInstruction: 'Turn over two cards. Find the same shape and word.',
    metricKey: 'accuracyPct',
    accuracyLabel: 'Pair accuracy',
    accuracyDescription: 'Matching pairs, divided by all attempts to turn over a pair.',
    instructions: [
      'Select two cards to turn them over.',
      'The same shapes and words stay face up. Different cards turn back over.',
      'Find all 3 pairs to finish.',
    ],
    protocolVersion: 1,
    metricVersion: 2,
  },
  {
    id: 'choice',
    name: 'Shape Pick',
    description: 'Choose the shape that matches the example.',
    duration: 'No time limit - 10 rounds',
    input: 'Mouse, trackpad, touch or pen',
    status: 'ready',
    practice: true,
    practiceInstruction: 'Look at the shape above. Select the same shape below.',
    metricKey: 'scorePoints',
    accuracyLabel: 'Match accuracy',
    accuracyDescription: 'Correct shape choices, divided by the 10 rounds.',
    instructions: [
      'Look at the shape and word at the top.',
      'Select the same shape and word below. Each correct choice earns 100 points.',
      'Make 10 choices to finish.',
    ],
    protocolVersion: 1,
    metricVersion: 2,
  },
];

for (const activity of activityList) {
  Object.freeze(activity);
}
export const activities = Object.freeze(activityList);

export function activityById(id) {
  return activities.find((activity) => activity.id === id);
}

export function traceAccuracyDescription(protocolVersion) {
  if (protocolVersion === 5) {
    return 'Small wobbles are allowed. Your line earns full credit inside the guide. Outside the guide, credit falls gradually as you move farther away. Every part you draw counts by its length. You can finish after a short section.';
  }
  if (protocolVersion === 4) {
    return 'The middle of the guide earns full credit. Credit falls as your line moves toward the edge. Parts outside the guide earn no credit. Every part you draw counts by its length. You can finish after a short section.';
  }
  if (protocolVersion === 3) {
    return 'How much of the line you drew stays close to the spiral. You do not have to trace every turn.';
  }
  return 'The part of your drawn line that stays close to the spiral.';
}

// decide based on what the device can actually do, not on screen width
export function supportsActivity(activityId, { hasFinePointer, observedMouse = false }) {
  if (activityId !== 'hold') {
    return true;
  }
  return hasFinePointer || observedMouse;
}

export const metrics = Object.freeze({
  meanDistancePctWidth: {
    key: 'meanDistancePctWidth',
    label: 'Distance from line',
    unit: '% of game width',
    direction: 'lower',
    description: 'Average distance between your drawn line and the spiral.',
  },
  coveragePct: {
    key: 'coveragePct',
    label: 'Spiral covered',
    unit: '%',
    direction: 'descriptive',
    description:
      'How much of the spiral you drew over. This is separate from accuracy; full coverage is not required from version 3 onward.',
  },
  speedCV: {
    key: 'speedCV',
    label: 'Speed variation',
    unit: 'CV',
    direction: 'descriptive',
    description:
      'Variation in drawing speed, including recorded stillness. Lifts and gaps over 200 ms are left out.',
  },
  completionSeconds: {
    key: 'completionSeconds',
    label: 'Time taken',
    unit: 's',
    direction: 'descriptive',
    description: 'Recorded game time. Spiral timing begins when drawing starts.',
  },
  tapsPerSecond: {
    key: 'tapsPerSecond',
    label: 'Taps per second',
    unit: 'taps/s',
    direction: 'descriptive',
    description: 'Taps on the circle divided by 10 seconds.',
  },
  rhythmCV: {
    key: 'rhythmCV',
    label: 'Tap rhythm variation',
    unit: 'CV',
    direction: 'descriptive',
    description: 'How much the time between taps varied. At least 4 taps are needed.',
  },
  hitCount: {
    key: 'hitCount',
    label: 'Hits',
    unit: 'hits',
    direction: 'descriptive',
    description: 'Taps or drops that reached the target.',
  },
  missCount: {
    key: 'missCount',
    label: 'Misses',
    unit: 'misses',
    direction: 'descriptive',
    description: 'Taps or drops that missed the target.',
  },
  scorePoints: {
    key: 'scorePoints',
    label: 'Score',
    unit: 'points',
    direction: 'higher',
    description:
      'Drag & Place: +100 per placement, -25 per miss, with a minimum of 0. Shape Pick: +100 per correct choice.',
  },
  matchedPairs: {
    key: 'matchedPairs',
    label: 'Pairs found',
    unit: 'pairs',
    direction: 'descriptive',
    description: 'Matching pairs found in Match Pairs.',
  },
  pairAttempts: {
    key: 'pairAttempts',
    label: 'Pair attempts',
    unit: 'attempts',
    direction: 'descriptive',
    description: 'Each turn that revealed two different cards.',
  },
  medianAcquisitionMs: {
    key: 'medianAcquisitionMs',
    label: 'Time per placement',
    unit: 'ms',
    direction: 'lower',
    description: 'Middle time taken to place a block in its box.',
  },
  accuracyPct: {
    key: 'accuracyPct',
    label: 'Accuracy',
    unit: '%',
    direction: 'higher',
    description: 'Each game measures accuracy differently. Compare the same game and setup.',
  },
  observedDriftPctWidth: {
    key: 'observedDriftPctWidth',
    label: 'Distance from ring center',
    unit: '% of game width',
    direction: 'lower',
    description:
      'Average observed distance of your pointer from the ring center. The ring moves in version 2; it stays still in version 1.',
  },
  timeInsidePct: {
    key: 'timeInsidePct',
    label: 'Time in ring',
    unit: '%',
    direction: 'higher',
    description:
      'Time inside the ring divided by the 10-second game. The ring moves in version 2; it stays still in version 1.',
  },
  outsideSurfaceSeconds: {
    key: 'outsideSurfaceSeconds',
    label: 'Time outside game area',
    unit: 's',
    direction: 'descriptive',
    description: 'Time the pointer was outside the game area.',
  },
});
