/** M4.1 visual-only weapon rig rules; no Phaser or DOM dependency. */
import type { RunBuild, WeaponId } from './progression.ts';

export type MountedWeapon = Exclude<WeaponId, 'rifle'>;

export const WEAPON_MOUNTS: Readonly<Record<MountedWeapon, { x: number; y: number; muzzle: number; label: string }>> = {
  scatter: { x: -33, y: -7, muzzle: 32, label: '散射肩炮' },
  arc: { x: 33, y: -8, muzzle: 33, label: '电弧线圈' },
  flame: { x: 27, y: 17, muzzle: 31, label: '燃烧喷射器' },
};

export const WEAPON_LIGHT: Readonly<Record<WeaponId, number>> = {
  rifle: 0x69f5dd, scatter: 0xffb16e, arc: 0x91b9ff, flame: 0xff7652,
};

/** Visually reward *each* card choice while limiting the maximum shader-free glow. */
export function visualPowerTier(build: Pick<RunBuild, 'selected'>): number {
  return Math.min(3, Math.max(0, build.selected.length));
}

/** Map body-space attachments into the rotating human-frame coordinate system. */
export function bodyOffset(
  x: number, y: number, bodyRotation: number,
): { x: number; y: number } {
  const c = Math.cos(bodyRotation);
  const s = Math.sin(bodyRotation);
  return { x: c * x - s * y, y: s * x + c * y };
}

/** Predict what is visible after choosing a new weapon. */
export function visibleLoadout(weapons: readonly WeaponId[]): readonly WeaponId[] {
  return (['rifle', 'scatter', 'arc', 'flame'] as const).filter(id => weapons.includes(id));
}
