/**
 * Renderer-neutral four-hardpoint geometry. Physical ownership, power tier,
 * slot offsets and tint originate from canonical main M4.1 weaponVisual.ts.
 * Cocos uses +Y up, whereas the Phaser art offsets use +Y down.
 */
import type { WeaponId } from './m6/progression.ts';
import {
  WEAPON_MOUNTS, WEAPON_LIGHT, bodyOffset, visibleLoadout,
} from './m6/weaponVisual.ts';

export interface RigPoint { readonly x: number; readonly y: number }
export interface RigMount {
  readonly id: WeaponId;
  readonly anchor: RigPoint;
  readonly muzzle: RigPoint;
  readonly angle: number;
  readonly tint: number;
  readonly level: number;
  readonly evolved: boolean;
  readonly glow: number;
}
export interface RigFrame {
  readonly player: RigPoint;
  readonly deployed: boolean;
  readonly weapons: readonly WeaponId[];
  readonly weaponAim: Readonly<Record<WeaponId, number>>;
  readonly weaponLevels: Readonly<Record<WeaponId, number>>;
  readonly evolved: Readonly<Record<WeaponId, boolean>>;
  readonly visualTier: number;
  readonly timeMs: number;
}

/** The four standard hardpoints never use the exclusive signature slot. */
export function weaponMuzzle(x: number, y: number, id: WeaponId, angle: number): RigPoint {
  const directionX = Math.cos(angle), directionY = Math.sin(angle);
  if (id === 'rifle') return {
    x: x + 5 + directionX * 43, y: y + 18 + directionY * 43,
  };
  const mount = WEAPON_MOUNTS[id];
  const offset = bodyOffset(mount.x, -mount.y, 0);
  return {
    x: x + offset.x + directionX * mount.muzzle,
    y: y + offset.y + directionY * mount.muzzle,
  };
}

export function buildWeaponRig(frame: RigFrame): readonly RigMount[] {
  // visualPowerTier is computed from the actual selected card list in PocWorld.
  const tier = Math.min(3, Math.max(0, frame.visualTier));
  const pulse = .76 + Math.sin(frame.timeMs / 112) * .24;
  return visibleLoadout(frame.weapons).map(id => {
    const angle = frame.weaponAim[id];
    const offset = id === 'rifle'
      ? { x: 5, y: 18 }
      : bodyOffset(WEAPON_MOUNTS[id].x, -WEAPON_MOUNTS[id].y, 0);
    const level = frame.weaponLevels[id];
    const evolved = frame.evolved[id];
    return {
      id,
      anchor: { x: frame.player.x + offset.x, y: frame.player.y + offset.y },
      muzzle: weaponMuzzle(frame.player.x, frame.player.y, id, angle),
      angle,
      tint: WEAPON_LIGHT[id],
      level,
      evolved,
      glow: Math.min(.84, (0.12 + tier * .13 + (frame.deployed ? .18 : 0)
        + (evolved ? .15 : 0)) * pulse),
    };
  });
}
