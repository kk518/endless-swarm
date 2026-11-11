import type { RunBuild, WeaponId } from './progression.ts';

/**
 * M5 deterministic growth rules, intentionally free of Phaser/DOM dependencies.
 * Choices are fully validated again at application time.
 */
export const MAX_RUN_LEVEL = 25;
export const MAX_WEAPON_LEVEL = 5;
export type EvolutionId = 'railgun' | 'annihilator';
export type LevelChoiceId =
  | 'weapon:rifle' | 'weapon:scatter' | 'weapon:arc' | 'weapon:flame'
  | 'evolve:rifle' | 'evolve:scatter'
  | 'core:damage' | 'core:rate' | 'core:speed' | 'core:repair';

export interface GrowthState {
  level: number;
  xp: number;
  weaponLevels: Record<WeaponId, number>;
  evolved: { rifle: boolean; scatter: boolean };
}
export interface LevelChoice {
  id: LevelChoiceId;
  name: string;
  description: string;
  icon: string;
  category: 'weapon' | 'evolution' | 'core';
}
export interface ExperienceGain { state: GrowthState; gainedLevels: number }
export interface WeaponTuning {
  damage: number; interval: number; range: number;
  pellets: number; chains: number; pierce: number; knockback: number;
}

export function newGrowth(): GrowthState {
  return {
    level: 1, xp: 0,
    weaponLevels: { rifle: 1, scatter: 1, arc: 1, flame: 1 },
    evolved: { rifle: false, scatter: false },
  };
}

/** Experience required to move from 'level' to the next level. */
export function xpToNext(level: number): number {
  const safe = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return 8 + 3 * (safe - 1) + 2 * Math.max(0, safe - 7);
}

export function killExperience(kind: string, elite: boolean): number {
  return (kind === 'boss' ? 12 : kind === 'bomber' ? 2 : 1) + (elite ? 4 : 0);
}

export function grantExperience(state: GrowthState, amount: number): ExperienceGain {
  const safe = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const next: GrowthState = {
    ...state, xp: state.xp + safe,
    weaponLevels: { ...state.weaponLevels }, evolved: { ...state.evolved },
  };
  let gainedLevels = 0;
  while (next.level < MAX_RUN_LEVEL && next.xp >= xpToNext(next.level)) {
    next.xp -= xpToNext(next.level);
    next.level += 1;
    gainedLevels += 1;
  }
  if (next.level >= MAX_RUN_LEVEL) next.xp = 0;
  return { state: next, gainedLevels };
}

export function installWeaponCalibration(growth: GrowthState, id: WeaponId): void {
  growth.weaponLevels[id] = Math.max(2, growth.weaponLevels[id]);
}

const WEAPON_NAMES: Record<WeaponId, string> = {
  rifle: '电磁步枪', scatter: '散射炮', arc: '电弧线圈', flame: '喷火器',
};

export function evolutionEligible(build: RunBuild, growth: GrowthState, weapon: 'rifle' | 'scatter'): boolean {
  if (!build.weapons.includes(weapon) || growth.weaponLevels[weapon] < MAX_WEAPON_LEVEL || growth.evolved[weapon]) return false;
  return weapon === 'rifle'
    ? build.pierce > 0 || build.criticalChance > 0
    : build.range > 1 || build.damage > 1;
}

const CORES: readonly LevelChoice[] = [
  { id: 'core:damage', name: '战斗校准', description: '全武器伤害 +8%（可叠加）', icon: '◆', category: 'core' },
  { id: 'core:rate', name: '快速供能', description: '全武器射速 +8%（可叠加）', icon: 'ϟ', category: 'core' },
  { id: 'core:speed', name: '机动推力', description: '移动速度 +7%（可叠加）', icon: '»', category: 'core' },
  { id: 'core:repair', name: '应急维修', description: '立即回复 1 点装甲', icon: '+', category: 'core' },
];

export function legalLevelChoices(build: RunBuild, growth: GrowthState): LevelChoice[] {
  const choices: LevelChoice[] = [];
  if (evolutionEligible(build, growth, 'rifle')) {
    choices.push({ id: 'evolve:rifle', name: '轨道歼灭炮', description: '步枪进化：额外穿透 2 个目标，伤害 +30%', icon: '✹', category: 'evolution' });
  }
  if (evolutionEligible(build, growth, 'scatter')) {
    choices.push({ id: 'evolve:scatter', name: '毁灭者霰弹炮', description: '散射进化：增加 3 枚弹丸，强力击退', icon: '✷', category: 'evolution' });
  }
  for (const id of build.weapons) {
    const level = growth.weaponLevels[id];
    if (level < MAX_WEAPON_LEVEL) choices.push({
      id: `weapon:${id}`,
      name: `${WEAPON_NAMES[id]} Lv.${level + 1}`,
      description: id === 'scatter' ? '提高伤害、射速；Lv.3/5 增加弹丸'
        : id === 'arc' ? '提高伤害、射速；Lv.3/5 增加跳链'
          : id === 'flame' ? '提高伤害、射速和喷射距离'
            : '提高伤害、射速和穿透作战效率',
      icon: id === 'rifle' ? '⇢' : id === 'scatter' ? '✦' : id === 'arc' ? 'ϟ' : '♨',
      category: 'weapon',
    });
  }
  choices.push(...CORES.filter(option => option.id !== 'core:repair' || build.hp < build.maxHp));
  return choices;
}

export function rollLevelChoices(
  build: RunBuild, growth: GrowthState, random: () => number = Math.random,
): LevelChoice[] {
  const pool = legalLevelChoices(build, growth);
  const chosen: LevelChoice[] = [];
  // Guaranteed evolution when its prerequisites have been earned.
  const evolution = pool.find(item => item.category === 'evolution');
  if (evolution) chosen.push(evolution);
  else {
    const weapons = pool.filter(item => item.category === 'weapon');
    if (weapons.length) {
      const value = random();
      const roll = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
      chosen.push(weapons[Math.floor(roll * weapons.length)]);
    }
  }
  const remaining = pool.filter(item => !chosen.includes(item));
  while (chosen.length < 3 && remaining.length) {
    const value = random();
    const roll = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
    chosen.push(remaining.splice(Math.floor(roll * remaining.length), 1)[0]);
  }
  return chosen;
}

export function applyLevelChoice(build: RunBuild, growth: GrowthState, id: LevelChoiceId): boolean {
  if (!legalLevelChoices(build, growth).some(option => option.id === id)) return false;
  if (id.startsWith('weapon:')) {
    const weapon = id.slice(7) as WeaponId;
    growth.weaponLevels[weapon] = Math.min(MAX_WEAPON_LEVEL, growth.weaponLevels[weapon] + 1);
  } else if (id === 'evolve:rifle') growth.evolved.rifle = true;
  else if (id === 'evolve:scatter') growth.evolved.scatter = true;
  else if (id === 'core:damage') build.damage *= 1.08;
  else if (id === 'core:rate') build.rate *= 1.08;
  else if (id === 'core:speed') build.speed *= 1.07;
  else if (id === 'core:repair') build.hp = Math.min(build.maxHp, build.hp + 1);
  return true;
}

export function weaponTuning(growth: GrowthState, weapon: WeaponId): WeaponTuning {
  const level = Math.min(MAX_WEAPON_LEVEL, Math.max(1, growth.weaponLevels[weapon]));
  const steps = level - 1;
  const damage = 1 + steps * 0.16;
  const interval = 1 - steps * 0.06;
  const scatterEvolved = weapon === 'scatter' && growth.evolved.scatter;
  const rifleEvolved = weapon === 'rifle' && growth.evolved.rifle;
  return {
    damage: damage * (rifleEvolved ? 1.3 : 1),
    interval,
    range: weapon === 'flame' ? 1 + steps * 0.08 : 1,
    pellets: weapon === 'scatter' ? 5 + (level >= 3 ? 2 : 0) + (level >= 5 ? 2 : 0) + (scatterEvolved ? 3 : 0) : 1,
    chains: weapon === 'arc' ? 4 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) : 1,
    pierce: rifleEvolved ? 2 : 0,
    knockback: scatterEvolved ? 32 : 0,
  };
}
