const ACTIVITY_IDS = ['trace', 'tap', 'aim', 'hold', 'sequence', 'memory', 'choice'];
const POINTER_TYPES = ['mouse', 'touch', 'pen'];
const HANDS = ['left', 'right', 'both', 'unspecified'];
const TARGET_MODES = ['standard', 'larger'];

function isVersion(value) {
  return Number.isInteger(value) && value >= 1;
}

// Builds the key used to decide which results can be compared with each other.
// Things like fatigue, notes, theme and DPR are left out on purpose.
// Geometry, input type, versions, hand and assistance are part of it.
export function comparisonKey(context, config, versions) {
  if (!ACTIVITY_IDS.includes(versions.activityId)) {
    throw new Error('Missing protocol identity.');
  }
  if (!isVersion(versions.protocolVersion) || !isVersion(versions.metricVersion)) {
    throw new Error('Missing protocol identity.');
  }

  if (!POINTER_TYPES.includes(context.pointerType)) {
    throw new Error('A measured pointer type is required.');
  }
  if (versions.activityId === 'hold' && context.pointerType !== 'mouse') {
    throw new Error('Cursor Hold requires a mouse or trackpad.');
  }

  if (!HANDS.includes(context.hand) || typeof context.deviceId !== 'string' || !context.deviceId) {
    throw new Error('Missing hand or device identity.');
  }

  if (
    typeof context.assistedInput !== 'boolean' ||
    typeof context.caregiverProvidedInput !== 'boolean'
  ) {
    throw new Error('Input assistance must be explicit.');
  }

  if (!Number.isFinite(context.surfaceCssWidth) || context.surfaceCssWidth <= 0) {
    throw new Error('Invalid task geometry.');
  }
  if (!Number.isFinite(context.surfaceCssHeight) || context.surfaceCssHeight <= 0) {
    throw new Error('Invalid task geometry.');
  }

  if (!TARGET_MODES.includes(config.targetSizeMode)) {
    throw new Error('Unknown target size mode.');
  }

  let pathId = config.pathId;
  if (pathId === undefined) {
    pathId = null;
  }
  let assistiveMode = context.assistiveInputMode;
  if (assistiveMode === undefined || assistiveMode === null) {
    assistiveMode = 'none';
  }

  return JSON.stringify([
    versions.activityId,
    versions.protocolVersion,
    versions.metricVersion,
    context.hand,
    context.deviceId,
    context.pointerType,
    Math.round(context.surfaceCssWidth),
    Math.round(context.surfaceCssHeight),
    pathId,
    config.targetSizeMode,
    assistiveMode,
    context.assistedInput,
    context.caregiverProvidedInput,
  ]);
}
