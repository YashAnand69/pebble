export const MOTION_STORAGE = 'pebble-motion-v1';
export function normalizeMotionPreference(value) {
  return value === 'reduced' ? 'reduced' : 'system';
}
export function motionMode(systemReduced, preference) {
  return systemReduced
    ? 'system-reduced'
    : normalizeMotionPreference(preference) === 'reduced'
      ? 'manual-reduced'
      : 'full';
}
export function boundedScrollProgress(position, range = 800) {
  if (!Number.isFinite(position) || !Number.isFinite(range) || range <= 0)
    return 0;
  return Math.max(0, Math.min(1, position / range));
}
export function pointerTilt(clientX, clientY, rect, limit = 7) {
  if (
    ![
      clientX,
      clientY,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      limit,
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    limit < 0
  )
    return { x: 0, y: 0 };
  const horizontal = Math.max(
    -1,
    Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1),
  );
  const vertical = Math.max(
    -1,
    Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1),
  );
  return {
    x: -vertical * Math.min(limit, 10),
    y: horizontal * Math.min(limit, 10),
  };
}
