import type { CardId, RunBuild, WeaponId } from './progression.ts';

/**
 * M5 deterministic growth rules, intentionally free of Phaser/DOM dependencies.
 * Choices are fully validated again at application time.
 */
export const MAX_RUN_LEVEL = 25;
export const MAX_WEAPON_LEVEL = 5;
export type EvolutionId = 'railgun' | 'annihilator' | 'tempest' | 'inferno';
export type LevelChoiceId =
  | 'weapon:rifle' | 'weapon:scatter' | 'weapon:arc' | 'weapon:flame'
  | 'evolve:rifle' | 'evolve:scatter' | 'evolve:arc' | 'evolve:flame'
  | 'core:damage' | 'core:rate' | 'core:speed' | 'core:repair';

export interface GrowthState {
  level: number;
  xp: number;
  weaponLevels: Record<WeaponId, number>;
  evolved: Record<WeaponId, boolean>;
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
  chainRange: number; shockMs: number; burnDurationMs: number; burnTickDamage: number; coneHalfAngle: number;
}

export function newGrowth(): GrowthState {
  return {
    level: 1, xp: 0,
    weaponLevels: { rifle: 1, scatter: 0, arc: 0, flame: 0 },
    evolved: { rifle: false, scatter: false, arc: false, flame: false },
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

export function evolutionEligible(build: RunBuild, growth: GrowthState, weapon: WeaponId): boolean {
  if (!build.weapons.includes(weapon) || growth.weaponLevels[weapon] < MAX_WEAPON_LEVEL || growth.evolved[weapon]) return false;
  // Evolution needs a specific tactical blueprint card. Generic XP stat bonuses
  // or supply passives must not accidentally bypass that recipe.
  switch (weapon) {
    case 'rifle': return build.selected.includes('pierce') || build.selected.includes('critical-core');
    case 'scatter': return build.selected.includes('radius') || build.selected.includes('warhead');
    case 'arc': return build.selected.includes('cryogenic') || build.selected.includes('chain-blast');
    case 'flame': return build.selected.includes('radius') || build.selected.includes('overload');
  }
}

/** Visible in upgrade descriptions and used to bias wave-end offers toward a playable build. */
export const EVOLUTION_RECIPES: Readonly<Record<WeaponId, readonly [CardId, CardId]>> = {
  rifle: ['pierce', 'critical-core'],
  scatter: ['radius', 'warhead'],
  arc: ['cryogenic', 'chain-blast'],
  flame: ['radius', 'overload'],
};

const RECIPE_CARD_NAMES: Readonly<Partial<Record<CardId, string>>> = {
  pierce: '穿甲弹', 'critical-core': '弱点扫描',
  radius: '扩散核心', warhead: '强化弹头',
  cryogenic: '冰霜弹头', 'chain-blast': '连环爆裂', overload: '超载反应堆',
};

export const EVOLUTION_NAMES: Readonly<Record<WeaponId, string>> = {
  rifle: '轨道歼灭炮', scatter: '毁灭者霰弹炮',
  arc: '雷暴矩阵', flame: '炼狱焚化器',
};

/**
 * When an owned weapon is Lv3+, wave-end rewards should actively make its
 * recipe available. These are normal tactical cards, not free unlocks.
 */
export function evolutionRecipeTargets(build: RunBuild, growth: GrowthState): CardId[] {
  const owned = [...build.weapons]
    .filter(weapon => growth.weaponLevels[weapon] >= 3 && !growth.evolved[weapon])
    .sort((a, b) => growth.weaponLevels[b] - growth.weaponLevels[a]);
  for (const weapon of owned) {
    const recipe = EVOLUTION_RECIPES[weapon];
    if (!recipe.some(id => build.selected.includes(id))) return [...recipe];
  }
  return [];
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
  if (evolutionEligible(build, growth, 'arc')) {
    choices.push({ id: 'evolve:arc', name: '雷暴矩阵', description: '电弧进化：最多八段跳链，传导更远并强制减速', icon: 'ϟ', category: 'evolution' });
  }
  if (evolutionEligible(build, growth, 'flame')) {
    choices.push({ id: 'evolve:flame', name: '炼狱焚化器', description: '火焰进化：扩大火幕并点燃敌人，造成持续灼烧', icon: '♨', category: 'evolution' });
  }
  for (const id of build.weapons) {
    const level = growth.weaponLevels[id];
    if (level < MAX_WEAPON_LEVEL) choices.push({
      id: `weapon:${id}`,
      name: `${WEAPON_NAMES[id]} Lv.${level + 1}`,
      description: (id === 'scatter' ? '提高伤害、射速；Lv.3/5 增加弹丸'
        : id === 'arc' ? '提高伤害、射速；Lv.3/5 增加跳链'
          : id === 'flame' ? '提高伤害、射速和喷射距离'
            : '提高伤害、射速和穿透作战效率')
        + (level >= 3 && !growth.evolved[id]
          ? `。进化：Lv.5 + ${EVOLUTION_RECIPES[id].map(x => RECIPE_CARD_NAMES[x]).join(' / ')}` : ''),
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
  // Multiple ready recipes are intentionally prioritized rather than hidden
  // behind randomness. Keep one slot for a normal upgrade when two are ready.
  const evolution = pool.filter(item => item.category === 'evolution');
  chosen.push(...evolution.slice(0, 2));
  if (chosen.length === 0) {
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
  else if (id === 'evolve:arc') growth.evolved.arc = true;
  else if (id === 'evolve:flame') growth.evolved.flame = true;
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
  const arcEvolved = weapon === 'arc' && growth.evolved.arc;
  const flameEvolved = weapon === 'flame' && growth.evolved.flame;
  return {
    damage: damage * (rifleEvolved ? 1.3 : arcEvolved ? 1.2 : flameEvolved ? 1.22 : 1),
    interval,
    range: weapon === 'flame' ? (1 + steps * 0.08) * (flameEvolved ? 1.2 : 1) : 1,
    pellets: weapon === 'scatter' ? 5 + (level >= 3 ? 2 : 0) + (level >= 5 ? 2 : 0) + (scatterEvolved ? 3 : 0) : 1,
    chains: weapon === 'arc' ? 4 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + (arcEvolved ? 2 : 0) : 1,
    pierce: rifleEvolved ? 2 : 0,
    knockback: scatterEvolved ? 32 : 0,
    chainRange: arcEvolved ? 218 : 160,
    shockMs: arcEvolved ? 1600 : 0,
    burnDurationMs: flameEvolved ? 1750 : 0,
    burnTickDamage: flameEvolved ? 6 : 0,
    coneHalfAngle: flameEvolved ? 0.58 : 0.45,
  };
}
