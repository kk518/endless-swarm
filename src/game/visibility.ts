/** Mobile combat field of view. All rectangles/positions are Phaser world units. */
export interface ViewRect { left: number; top: number; right: number; bottom: number }
export interface Vec2 { x: number; y: number }

export const MOBILE_WORLD_WIDTH = 600;
export const HUD_DESIGN_WIDTH = 450;
// Allow an on-screen approach before the first ordinary auto-lock (~0.4–0.6s).
export const TARGET_INSET = 64;
export const ARRIVAL_WARNING_MS = 700;

/** A target must move into the readable inner part of the screen before normal auto-fire. */
export function insideReadableView(point: Vec2, view: ViewRect, inset = TARGET_INSET): boolean {
  return point.x >= view.left + inset && point.x <= view.right - inset
    && point.y >= view.top + inset && point.y <= view.bottom - inset;
}

/** Project a spawn towards a visible screen edge, not a fixed offscreen distance.
 * Fall back to the legacy radial spawning if no safe edge exists (tight desktop/arena edge).
 * All candidates stay at least minimumDistance from the player and within the world. */
export function visibleEdgeSpawn(
  player: Vec2,
  view: ViewRect,
  angle: number,
  worldSize: number,
  desiredDistance: number,
  minimumDistance = 245,
  inset = 16,
): Vec2 | null {
  if (!Number.isFinite(angle) || !Number.isFinite(desiredDistance)) return null;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const xEdge = dx > 0.00001 ? (view.right - inset - player.x) / dx
    : dx < -0.00001 ? (view.left + inset - player.x) / dx : Infinity;
  const yEdge = dy > 0.00001 ? (view.bottom - inset - player.y) / dy
    : dy < -0.00001 ? (view.top + inset - player.y) / dy : Infinity;
  const distance = Math.min(xEdge, yEdge, desiredDistance);
  if (!Number.isFinite(distance) || distance < minimumDistance) return null;
  const x = player.x + dx * distance, y = player.y + dy * distance;
  if (x < 42 || x > worldSize - 42 || y < 42 || y > worldSize - 42) return null;
  if (!insideReadableView({ x, y }, view, Math.min(inset, TARGET_INSET))) return null;
  return { x, y };
}
