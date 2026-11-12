import type { ContentCatalog, WeaponSlot } from './contentCatalog.ts';

/**
 * A runtime attack driver is distinct from static catalog metadata.
 * A weapon can only become playable when its driver actually exists.
 * Scene-specific target/tuning types are generic to keep Phaser out of core.
 */
export interface AttackDriver<TTarget, TTuning> {
  readonly driverId: string;
  readonly slot: WeaponSlot;
  readonly baseRange: number;
  readonly baseIntervalMs: number;
  readonly attack: (target: TTarget, angle: number, tuning: TTuning) => void;
}
export type WeaponRuntimeRegistry<TTarget, TTuning> =
  ReadonlyMap<string, Readonly<AttackDriver<TTarget, TTuning>>>;

/** Registers the ordinary and future exclusive weapon ports in one table. */
export function createWeaponRuntimeRegistry<TTarget, TTuning>(
  catalog: ContentCatalog, drivers: readonly AttackDriver<TTarget, TTuning>[],
): WeaponRuntimeRegistry<TTarget, TTuning> {
  const byDriver = new Map<string, Readonly<AttackDriver<TTarget, TTuning>>>();
  for (const driver of drivers) {
    if (!driver.driverId || byDriver.has(driver.driverId)
      || !Number.isFinite(driver.baseRange) || driver.baseRange <= 0
      || !Number.isFinite(driver.baseIntervalMs) || driver.baseIntervalMs <= 0
      || typeof driver.attack !== 'function') {
      throw new Error(`Invalid or duplicate attack driver: ${driver.driverId}`);
    }
    byDriver.set(driver.driverId, driver);
  }
  const runtimes = new Map<string, Readonly<AttackDriver<TTarget, TTuning>>>();
  for (const weapon of catalog.weapons.values()) {
    const driver = byDriver.get(weapon.driverId);
    if (!driver || driver.slot !== weapon.slot) {
      throw new Error(`Missing ${weapon.slot} attack driver for ${weapon.id}`);
    }
    runtimes.set(weapon.id, driver);
  }
  return runtimes;
}

/** Useful when selecting a hero, equipping a normal weapon, or restoring a run. */
export function assertWeaponSlots(
  ids: readonly string[], registry: WeaponRuntimeRegistry<unknown, unknown>,
  maxOrdinary = 4,
): void {
  const seen = new Set<string>();
  let ordinary = 0, signature = 0;
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Weapon equipped twice: ${id}`);
    seen.add(id);
    const driver = registry.get(id);
    if (!driver) throw new Error(`Weapon has no runtime: ${id}`);
    if (driver.slot === 'signature') signature++;
    else ordinary++;
  }
  if (ordinary > maxOrdinary || signature > 1) throw new Error('Weapon slot limit exceeded');
}
