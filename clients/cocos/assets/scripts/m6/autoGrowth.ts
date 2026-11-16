import type { RunBuild, WeaponId } from './progression.ts';
import {
  applyLevelChoice, evolutionEligible, EVOLUTION_NAMES, MAX_WEAPON_LEVEL,
  type GrowthState, type LevelChoiceId,
} from './arsenal.ts';

export type TrainingFocus = 'damage' | 'rate' | 'speed';
export interface TrainingPlan { weapon: WeaponId; focus: TrainingFocus }
export const DEFAULT_TRAINING: Readonly<TrainingPlan> = { weapon: 'rifle', focus: 'damage' };

export const TRAINING_LABELS: Readonly<Record<TrainingFocus, string>> = {
  damage: '火力', rate: '速攻', speed: '机动',
};

/** Deterministic, player-directed growth. Only equipped weapons can consume XP ranks. */
export function chooseAutomaticUpgrade(build: RunBuild, growth: GrowthState, plan: TrainingPlan): LevelChoiceId {
  const preferred = build.weapons.includes(plan.weapon) ? plan.weapon : build.weapons[0];
  const ordered = [preferred, ...build.weapons.filter(id => id !== preferred)];
  for (const weapon of ordered) {
    if (growth.weaponLevels[weapon] > 0 && growth.weaponLevels[weapon] < MAX_WEAPON_LEVEL) {
      return `weapon:${weapon}` as LevelChoiceId;
    }
  }
  return `core:${plan.focus}` as LevelChoiceId;
}

/** Unlock at most one evolution per owned weapon, immediately on meeting the recipe. */
export function applyAutomaticEvolutions(build: RunBuild, growth: GrowthState): WeaponId[] {
  const unlocked: WeaponId[] = [];
  for (const weapon of build.weapons) {
    if (!evolutionEligible(build, growth, weapon)) continue;
    if (applyLevelChoice(build, growth, `evolve:${weapon}` as LevelChoiceId)) unlocked.push(weapon);
  }
  return unlocked;
}

export interface AutomaticGrowthResult { upgrades: LevelChoiceId[]; evolutions: WeaponId[] }

/** Each gained pilot level gets exactly one upgrade; recipes cost no extra XP rank. */
export function applyAutomaticLevels(
  build: RunBuild, growth: GrowthState, levels: number, plan: TrainingPlan,
): AutomaticGrowthResult {
  const upgrades: LevelChoiceId[] = [];
  const evolutions: WeaponId[] = [];
  const safe = Number.isFinite(levels) ? Math.min(24, Math.max(0, Math.floor(levels))) : 0;
  for (let index = 0; index < safe; index++) {
    const id = chooseAutomaticUpgrade(build, growth, plan);
    if (!applyLevelChoice(build, growth, id)) throw new Error(`Invalid automatic growth choice: ${id}`);
    upgrades.push(id);
    evolutions.push(...applyAutomaticEvolutions(build, growth));
  }
  return { upgrades, evolutions };
}

export function summarizeGrowth(result: AutomaticGrowthResult, growth: GrowthState): string {
  if (result.evolutions.length) return `进化完成 · ${result.evolutions.map(id => EVOLUTION_NAMES[id]).join(' / ')}`;
  if (result.upgrades.length === 0) return '';
  if (result.upgrades.length > 1) return `连续成长 +${result.upgrades.length} 级 · 当前 LV.${growth.level}`;
  const upgrade = result.upgrades[0];
  return upgrade.startsWith('weapon:')
    ? `${({ rifle: '电磁步枪', scatter: '散射炮', arc: '电弧线圈', flame: '喷火器' } as Record<WeaponId, string>)[upgrade.slice(7) as WeaponId]} Lv.${growth.weaponLevels[upgrade.slice(7) as WeaponId]}`
    : `训练升级 · ${TRAINING_LABELS[upgrade.slice(5) as TrainingFocus]}`;
}
