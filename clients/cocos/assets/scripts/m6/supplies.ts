/** M3 supply-drop rules; renderer-agnostic and testable. */
export type SupplyKind = 'repair' | 'overclock' | 'emp';

export const SUPPLY_PERIOD_MS = 22000;
export const SUPPLY_TTL_MS = 22000;
export const SUPPLY_REACH = 42;
export const MAX_SUPPLIES = 7;

export function rollSupplyKind(needRepair: boolean, random: () => number = Math.random): SupplyKind {
  const raw = random();
  const roll = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0.5;
  if (needRepair) return roll < 0.3 ? 'repair' : roll < 0.66 ? 'overclock' : 'emp';
  // At full armor, don't generate a useless heal.
  return roll < 0.55 ? 'overclock' : 'emp';
}

export function withinPickupReach(distanceSquared: number, magnet: boolean): boolean {
  const reach = SUPPLY_REACH * (magnet ? 1.8 : 1);
  return Number.isFinite(distanceSquared) && distanceSquared >= 0 && distanceSquared <= reach * reach;
}

export function overclockDurationMs(surgeCell: boolean): number {
  return surgeCell ? 13000 : 8500;
}

export function empStats(empArray: boolean): { radius: number; damage: number } {
  return empArray ? { radius: 310, damage: 145 } : { radius: 240, damage: 100 };
}

/** Elite spawn frequency increases gently with wave count, with a hard on-screen cap. */
export function canSpawnElite(
  wave: number, kind: string, aliveElites: number, random: () => number = Math.random,
): boolean {
  return wave >= 2 && kind !== 'boss' && kind !== 'bomber' && aliveElites < 3
    && random() < Math.min(0.14, 0.05 + wave * 0.018);
}
