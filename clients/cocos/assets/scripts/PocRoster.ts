/**
 * Migration-only, actually executable hero/weapon roster based on the canonical
 * M6 content/driver registries. The old production catalog remains unchanged.
 * Unlocking a hero requires its real runtime and attack driver here.
 */
import {
  CONTENT_CATALOG, createContentCatalog, resolveHeroLoadout, type ContentCatalog,
} from './m6/contentCatalog.ts';
import { createHeroRuntimeRegistry } from './m6/heroRuntime.ts';
import { createWeaponRuntimeRegistry, assertWeaponSlots } from './m6/weaponRuntime.ts';

export type PocHeroId = 'marine' | 'kane';
export interface PocTarget { id: number; x: number; y: number; hp: number }
export interface PocAttackPort {
  rifle(target: PocTarget, angle: number): void;
  scatter(target: PocTarget, angle: number): void;
  arc(target: PocTarget, angle: number): void;
  flame(target: PocTarget, angle: number): void;
  rail(target: PocTarget, angle: number): void;
}

const starter = CONTENT_CATALOG.heroes.get('marine');
const rifle = CONTENT_CATALOG.weapons.get('rifle');
const scatter = CONTENT_CATALOG.weapons.get('scatter');
const arc = CONTENT_CATALOG.weapons.get('arc');
const flame = CONTENT_CATALOG.weapons.get('flame');
if (!starter || !rifle || !scatter || !arc || !flame) throw new Error('Canonical M6 content definitions missing');

export const POC_CATALOG: ContentCatalog = createContentCatalog(
  [
    starter,
    { id: 'kane', name: '凯恩 · 重装先锋', starterWeaponId: 'rifle',
      passiveId: 'siege-specialist', signatureWeaponId: 'kane-rail' },
  ],
  [
    rifle, scatter, arc, flame,
    { id: 'kane-rail', name: '攻城轨道炮', slot: 'signature',
      tags: ['kinetic','piercing','deploy'], driverId: 'rail' },
  ],
);
export const POC_HERO_RUNTIME = createHeroRuntimeRegistry(
  POC_CATALOG,
  [
    { heroId: 'marine', passiveId: null },
    { heroId: 'kane', passiveId: 'siege-specialist' },
  ],
);
export const POC_WEAPON_RUNTIME = createWeaponRuntimeRegistry<PocTarget, PocAttackPort>(
  POC_CATALOG,
  [
    { driverId: 'rifle', slot: 'standard', baseRange: 340, baseIntervalMs: 255,
      attack: (target, angle, port) => port.rifle(target, angle) },
    { driverId: 'scatter', slot: 'standard', baseRange: 270, baseIntervalMs: 850,
      attack: (target, angle, port) => port.scatter(target, angle) },
    { driverId: 'arc', slot: 'standard', baseRange: 250, baseIntervalMs: 940,
      attack: (target, angle, port) => port.arc(target, angle) },
    { driverId: 'flame', slot: 'standard', baseRange: 190, baseIntervalMs: 170,
      attack: (target, angle, port) => port.flame(target, angle) },
    { driverId: 'rail', slot: 'signature', baseRange: 380, baseIntervalMs: 2050,
      attack: (target, angle, port) => port.rail(target, angle) },
  ],
);

export const POC_PLAYABLE_HEROES = ['marine', 'kane'] as const;
export function resolvePocHero(heroId: PocHeroId) {
  if (!POC_PLAYABLE_HEROES.includes(heroId)) throw new Error('Unregistered PoC hero');
  const loadout = resolveHeroLoadout(POC_CATALOG, heroId);
  assertWeaponSlots(
    [...loadout.standardWeaponIds, ...(loadout.signatureWeaponId ? [loadout.signatureWeaponId] : [])],
    POC_WEAPON_RUNTIME, 4,
  );
  if (!POC_HERO_RUNTIME.has(heroId)) throw new Error('Missing hero passive runtime');
  return { hero: POC_CATALOG.heroes.get(heroId)!, loadout };
}
