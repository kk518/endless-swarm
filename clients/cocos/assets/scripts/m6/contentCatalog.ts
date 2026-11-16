/**
 * Content definitions are metadata, not combat implementations.
 * Adding a weapon does not silently make it usable in GameScene: an attack
 * driver and art hook must be registered before the item is marked playable.
 * This seam keeps future heroes and signature weapons out of the legacy WeaponId union.
 */
export type ContentKey = string;
export type WeaponSlot = 'standard' | 'signature';
export type WeaponTag =
  | 'kinetic' | 'piercing' | 'scatter' | 'electric' | 'burning'
  | 'frost' | 'deploy' | 'summon' | 'control' | 'explosive';

export interface WeaponDefinition {
  readonly id: ContentKey;
  readonly name: string;
  readonly slot: WeaponSlot;
  readonly tags: readonly WeaponTag[];
  /** Runtime driver key, e.g. 'rifle'. New weapons need an actual driver. */
  readonly driverId: string;
}
export interface HeroDefinition {
  readonly id: ContentKey;
  readonly name: string;
  readonly starterWeaponId: ContentKey;
  /** Empty for the current generic trooper; later heroes register real passives. */
  readonly passiveId: ContentKey | null;
  /** Exclusive gear never occupies one of the four ordinary weapon slots. */
  readonly signatureWeaponId: ContentKey | null;
}
export interface ContentCatalog {
  readonly heroes: ReadonlyMap<string, Readonly<HeroDefinition>>;
  readonly weapons: ReadonlyMap<string, Readonly<WeaponDefinition>>;
}
export interface HeroLoadout {
  readonly heroId: string;
  readonly standardWeaponIds: readonly string[];
  readonly signatureWeaponId: string | null;
}

function validKey(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}

export function createContentCatalog(
  heroes: readonly HeroDefinition[], weapons: readonly WeaponDefinition[],
): ContentCatalog {
  const weaponMap = new Map<string, Readonly<WeaponDefinition>>();
  const heroMap = new Map<string, Readonly<HeroDefinition>>();
  for (const item of weapons) {
    if (!validKey(item.id) || !item.name.trim() || !validKey(item.driverId) || weaponMap.has(item.id)) {
      throw new Error(`Invalid or duplicate weapon: ${item.id}`);
    }
    if (item.slot !== 'standard' && item.slot !== 'signature') throw new Error(`Unknown weapon slot: ${item.id}`);
    if (item.tags.some(tag => !tag.trim())) throw new Error(`Empty weapon tag: ${item.id}`);
    weaponMap.set(item.id, Object.freeze({ ...item, tags: Object.freeze([...item.tags]) }));
  }
  for (const hero of heroes) {
    if (!validKey(hero.id) || !hero.name.trim() || heroMap.has(hero.id)) {
      throw new Error(`Invalid or duplicate hero: ${hero.id}`);
    }
    const starter = weaponMap.get(hero.starterWeaponId);
    if (!starter || starter.slot !== 'standard') throw new Error(`Hero ${hero.id} has no standard starter`);
    if (hero.signatureWeaponId !== null) {
      const signature = weaponMap.get(hero.signatureWeaponId);
      if (!signature || signature.slot !== 'signature') throw new Error(`Hero ${hero.id} has invalid signature weapon`);
    }
    if (hero.passiveId !== null && !validKey(hero.passiveId)) throw new Error(`Invalid passive for ${hero.id}`);
    heroMap.set(hero.id, Object.freeze({ ...hero }));
  }
  if (heroMap.size === 0) throw new Error('Catalog needs at least one playable hero');
  return { heroes: heroMap, weapons: weaponMap };
}

export function resolveHeroLoadout(catalog: ContentCatalog, heroId: string): HeroLoadout {
  const hero = catalog.heroes.get(heroId);
  if (!hero) throw new Error(`Unknown hero: ${heroId}`);
  return Object.freeze({
    heroId: hero.id,
    standardWeaponIds: Object.freeze([hero.starterWeaponId]),
    signatureWeaponId: hero.signatureWeaponId,
  });
}

/**
 * Initial production catalog contains only weapons that the renderer can fire.
 * Future designs (Kane, Ash, Eve, etc.) are deliberately not made selectable
 * until their passive, signature attack and visuals actually exist.
 */
export const CURRENT_HERO_ID = 'marine';
export const CONTENT_CATALOG = createContentCatalog(
  [{ id: CURRENT_HERO_ID, name: '星际战士', starterWeaponId: 'rifle', passiveId: null, signatureWeaponId: null }],
  [
    { id: 'rifle', name: '电磁步枪', slot: 'standard', tags: ['kinetic', 'piercing'], driverId: 'rifle' },
    { id: 'scatter', name: '散射炮', slot: 'standard', tags: ['kinetic', 'scatter'], driverId: 'scatter' },
    { id: 'arc', name: '电弧线圈', slot: 'standard', tags: ['electric', 'control'], driverId: 'arc' },
    { id: 'flame', name: '火焰喷射器', slot: 'standard', tags: ['burning', 'control'], driverId: 'flame' },
  ],
);
