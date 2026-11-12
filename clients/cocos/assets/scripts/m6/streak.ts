/** M2 kill-chain rules. Kept independent of Phaser so the combo can be tested. */
export const STREAK_WINDOW_MS = 4500;
export const STREAK_MILESTONES = [5, 10, 20] as const;

export function advanceStreak(streak: number, lastKillMs: number, nowMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(lastKillMs)) return 1;
  if (streak <= 0 || nowMs < lastKillMs || nowMs - lastKillMs > STREAK_WINDOW_MS) return 1;
  return Math.min(999, streak + 1);
}

export function streakActive(streak: number, lastKillMs: number, nowMs: number): boolean {
  return streak > 0 && nowMs >= lastKillMs && nowMs - lastKillMs <= STREAK_WINDOW_MS;
}

export function streakTier(streak: number): number {
  return streak >= 20 ? 3 : streak >= 10 ? 2 : streak >= 5 ? 1 : 0;
}

/** Bonus damage rewards sustained kills; the Frenzy card strengthens each tier. */
export function streakDamageMultiplier(streak: number, frenzy: boolean): number {
  return 1 + streakTier(streak) * (frenzy ? 0.15 : 0.1);
}
