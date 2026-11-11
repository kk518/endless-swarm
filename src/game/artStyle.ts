/** M4 visual lexicon: silhouettes are species-specific, never colorized clones. */
import type { EnemyKind } from './progression.ts';

export const HIVE_TEXTURE: Readonly<Record<EnemyKind, string>> = {
  grunt: 'crawler',
  leaper: 'leaper',
  armored: 'armored',
  spitter: 'spitter',
  bomber: 'bomber',
  boss: 'broodlord',
};

export const HIVE_GORE: Readonly<Record<EnemyKind, number>> = {
  grunt: 0x8d4f57,
  leaper: 0xa45e56,
  armored: 0x6c5255,
  spitter: 0x80a861,
  bomber: 0xc55c71,
  boss: 0x99444f,
};

export const FACTION_COLORS = {
  marine: 0x73e7da,
  command: 0xf2af6a,
  metal: 0x374e55,
  infection: 0x8f4654,
  acid: 0xb2dc6c,
  bone: 0xd1b38d,
} as const;
