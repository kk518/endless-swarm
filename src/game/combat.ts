/** Deterministic rules shared by the game and tests. No renderer dependency. */
export const GAMEPLAY = {
  moveSpeed: 230,
  fireRange: 360,
  fireIntervalMs: 255,
  projectileSpeed: 750,
  projectileLifetimeMs: 630,
  bulletDamage: 28,
  deployDelayMs: 800,
  deployDamageMultiplier: 1.35,
  deployRateMultiplier: 1.25,
  playerMaxHealth: 6,
  hitGraceMs: 750,
  maxEnemies: 95,
} as const;

export interface Point { x: number; y: number }
export interface TargetPoint extends Point { alive: boolean }

/** Pick nearest living target within range; keep prior target when similar in distance. */
export function selectTarget<T extends TargetPoint>(
  origin: Point, candidates: readonly T[], range: number, previous?: T | null,
): T | null {
  const rangeSq = range * range;
  let best: T | null = null;
  let bestSq = rangeSq;
  for (const candidate of candidates) {
    if (!candidate.alive) continue;
    const dx = candidate.x - origin.x;
    const dy = candidate.y - origin.y;
    const dSq = dx * dx + dy * dy;
    if (dSq <= bestSq) { best = candidate; bestSq = dSq; }
  }
  if (previous?.alive) {
    const dx = previous.x - origin.x;
    const dy = previous.y - origin.y;
    const oldSq = dx * dx + dy * dy;
    if (oldSq <= rangeSq && oldSq <= bestSq * 1.25) return previous;
  }
  return best;
}

export function fireIntervalMs(deployed: boolean): number {
  return GAMEPLAY.fireIntervalMs / (deployed ? GAMEPLAY.deployRateMultiplier : 1);
}

export function bulletDamage(deployed: boolean): number {
  return GAMEPLAY.bulletDamage * (deployed ? GAMEPLAY.deployDamageMultiplier : 1);
}

export function isDeployed(stationaryMs: number, moving: boolean): boolean {
  return !moving && stationaryMs >= GAMEPLAY.deployDelayMs;
}

export function normalizedMove(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy);
  return len > 1 ? { x: dx / len, y: dy / len } : { x: dx, y: dy };
}

export function spawnIntervalMs(elapsedSeconds: number): number {
  return Math.max(240, 970 - elapsedSeconds * 13);
}

export function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A bounded fixed-step clock: smooth at 30/60/120 FPS, safe after a long tab suspension. */
export const FIXED_STEP_MS = 1000 / 60;

export function fixedStepBatch(
  remainderMs: number, deltaMs: number, maxSteps = 5,
): { steps: number; remainderMs: number } {
  const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, Math.min(deltaMs, 250)) : 0;
  const carry = Number.isFinite(remainderMs) ? Math.max(0, Math.min(remainderMs, FIXED_STEP_MS)) : 0;
  const pending = carry + safeDelta;
  const steps = Math.min(maxSteps, Math.floor((pending + 1e-7) / FIXED_STEP_MS));
  const left = Math.max(0, pending - steps * FIXED_STEP_MS);
  // Deliberately drop old backlog after a serious frame stall: never simulate a lethal catch-up burst.
  return { steps, remainderMs: steps >= maxSteps ? Math.min(left, FIXED_STEP_MS - 1e-6) : left };
}
