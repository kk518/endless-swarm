import type { ContentCatalog } from './contentCatalog.ts';

/**
 * Explicit passive lifecycle port. Hero runtimes are registered separately
 * from static roster metadata; unfinished heroes are never selectable.
 *
 * Passive callbacks are provided by the battle adapter. They may observe
 * combat events but their gameplay side effects must be implemented in the
 * adapter, not smuggled into the data-only hero catalog.
 */
export interface HeroKillEvent {
  readonly enemyKind: string;
  readonly elite: boolean;
  readonly timeMs: number;
}
export interface HeroPassiveRuntime {
  readonly heroId: string;
  readonly passiveId: string | null;
  readonly onRunStart?: () => void;
  readonly onCombatTick?: (deltaMs: number) => void;
  readonly onEnemyKilled?: (event: HeroKillEvent) => void;
}

export function createHeroRuntimeRegistry(
  catalog: ContentCatalog, runtimes: readonly HeroPassiveRuntime[],
): ReadonlyMap<string, Readonly<HeroPassiveRuntime>> {
  const registered = new Map<string, Readonly<HeroPassiveRuntime>>();
  for (const runtime of runtimes) {
    if (registered.has(runtime.heroId)) throw new Error(`Duplicate hero runtime: ${runtime.heroId}`);
    const hero = catalog.heroes.get(runtime.heroId);
    if (!hero || hero.passiveId !== runtime.passiveId) {
      throw new Error(`Hero runtime/passive mismatch: ${runtime.heroId}`);
    }
    registered.set(runtime.heroId, runtime);
  }
  for (const hero of catalog.heroes.values()) {
    if (!registered.has(hero.id)) throw new Error(`Missing hero runtime: ${hero.id}`);
  }
  return registered;
}
