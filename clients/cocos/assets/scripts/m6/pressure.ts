/** Deterministic M4 swarm pacing. Keep spawn pressure predictable and capped on phones. */
export const SURGE_PERIOD_MS = 14500;
export const SURGE_WARNING_MS = 1250;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Within-wave escalation: faster arrivals and larger packs as the timer runs down. */
export function pressurePlan(waveNumber: number, elapsedMs: number, durationMs: number): {
  intervalMs: number;
  groupSize: number;
  speedMultiplier: number;
  surgeSize: number;
  spawnRadius: number;
} {
  const wave = Math.max(1, Math.min(5, Math.floor(waveNumber)));
  const progress = clamp01(elapsedMs / Math.max(1, durationMs));
  const cadence = [690, 530, 430, 360, 340][wave - 1];
  const baseGroup = [1, 2, 2, 3, 3][wave - 1];
  return {
    intervalMs: Math.round(cadence * (1 - progress * 0.17)),
    groupSize: Math.min(4, baseGroup + (progress >= 0.6 ? 1 : 0)),
    speedMultiplier: 1.04 + wave * 0.075 + progress * 0.11,
    surgeSize: Math.min(8, 3 + wave),
    spawnRadius: Math.max(325, 415 - wave * 17),
  };
}

/** Group members fan out across the forward and side sectors, never exactly on the player. */
export function spawnOffset(index: number): number {
  const offsets = [0, 0.7, -0.7, 1.35, -1.35, Math.PI, 2.35, -2.35];
  return offsets[index % offsets.length];
}
