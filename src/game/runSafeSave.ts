import {
  fromCheckpoint, THREE_ACT_BLUEPRINT, getEncounter,
  type CampaignCheckpoint,
} from './campaignDirector.ts';
import { CARDS, type RunBuild, type WeaponId, type CardId } from './progression.ts';
import { MAX_RUN_LEVEL, MAX_WEAPON_LEVEL, xpToNext, type GrowthState } from './arsenal.ts';
import type { TrainingPlan } from './autoGrowth.ts';
import type { RandomCheckpoint } from './runRandom.ts';

export const SAFE_RUN_KEY = 'endless-swarm-expedition-safe-v1';
export interface RunSafeSave {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly heroId: string;
  readonly savedAtMs: number;
  readonly campaign: CampaignCheckpoint;
  readonly build: RunBuild;
  readonly growth: GrowthState;
  readonly training: TrainingPlan;
  readonly hp: number;
  readonly timeMs: number;
  readonly kills: number;
  readonly bestStreak: number;
  readonly salvageKills: number;
  readonly suppliesCollected: number;
  readonly routePressureMultiplier: number;
  readonly randoms: RandomCheckpoint;
  /** Fixed already-rolled cards so refreshing a safe node cannot reroll them. */
  readonly cardOfferIds: readonly CardId[];
}
export interface SafeRunStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const ids: readonly WeaponId[] = ['rifle', 'scatter', 'arc', 'flame'];
const cards = new Set(CARDS.map(c => c.id));
const keys: readonly (keyof RunBuild)[] = [
  'weapons', 'damage', 'rate', 'speed', 'range', 'pierce', 'explosionChance',
  'frost', 'afterglow', 'deployDelay', 'overload', 'bulwark', 'frenzy', 'salvage',
  'criticalChance', 'supplyMagnet', 'surgeCell', 'empArray', 'maxHp', 'hp', 'selected',
];
const booleanKeys: readonly (keyof RunBuild)[] = [
  'frost', 'afterglow', 'overload', 'bulwark', 'frenzy',
  'salvage', 'supplyMagnet', 'surgeCell', 'empArray',
];
const numberKeys: readonly (keyof RunBuild)[] = [
  'damage', 'rate', 'speed', 'range', 'pierce', 'explosionChance',
  'deployDelay', 'criticalChance', 'maxHp', 'hp',
];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const boundedNumber = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const uint = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

export function parseRunSafeSave(raw: unknown): RunSafeSave | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.heroId !== 'marine'
    || typeof raw.runId !== 'string' || !/^[a-z0-9-]{8,128}$/.test(raw.runId)
    || !uint(raw.savedAtMs, Number.MAX_SAFE_INTEGER)) return null;
  const state = fromCheckpoint(THREE_ACT_BLUEPRINT, raw.campaign);
  if (!state || (state.phase !== 'playing' && state.phase !== 'reward')) return null;
  if (state.phase === 'playing' && state.elapsedMs !== 0) return null;
  const wave = getEncounter(THREE_ACT_BLUEPRINT, state.stageIndex).encounter;
  const build = raw.build;
  if (!isRecord(build) || keys.some(key => !(key in build))
    || booleanKeys.some(key => typeof build[key] !== 'boolean')
    || numberKeys.some(key => !boundedNumber(build[key], 0, 1000))
    || !Array.isArray(build.weapons) || !build.weapons.length || build.weapons.length > 4
    || build.weapons.some((w: unknown) => !ids.includes(w as WeaponId))
    || new Set(build.weapons).size !== build.weapons.length || !build.weapons.includes('rifle')
    || !Array.isArray(build.selected) || build.selected.length > 100
    || build.selected.some((c: unknown) => !cards.has(c as CardId))
    || !Number.isInteger(build.pierce) || !Number.isInteger(build.maxHp)
    || (build.maxHp as number) < 1 || !boundedNumber(build.hp, 1, build.maxHp as number)
    || (build.damage as number) <= 0 || (build.rate as number) <= 0 || (build.speed as number) <= 0
    || (build.range as number) <= 0 || (build.deployDelay as number) <= 0
    || (build.explosionChance as number) > 1 || (build.criticalChance as number) > 1) return null;
  const growth = raw.growth;
  if (!isRecord(growth) || !uint(growth.level, MAX_RUN_LEVEL) || growth.level < 1
    || !uint(growth.xp, 5000) || (growth.level < MAX_RUN_LEVEL && growth.xp >= xpToNext(growth.level as number))
    || !isRecord(growth.weaponLevels) || !isRecord(growth.evolved)) return null;
  for (const id of ids) {
    const lvl = growth.weaponLevels[id];
    if (!uint(lvl, MAX_WEAPON_LEVEL) || (build.weapons.includes(id) && lvl < 1)
      || typeof growth.evolved[id] !== 'boolean' || (growth.evolved[id] && lvl < MAX_WEAPON_LEVEL)) return null;
  }
  const training = raw.training;
  if (!isRecord(training) || !ids.includes(training.weapon as WeaponId)
    || !build.weapons.includes(training.weapon)
    || !['damage', 'rate', 'speed'].includes(training.focus as string)) return null;
  const rng = raw.randoms;
  if (!isRecord(rng) || ['combat', 'rewards', 'events', 'visuals']
    .some(k => !uint(rng[k], 0xffffffff) || rng[k] === 0)) return null;
  if (!boundedNumber(raw.hp, 1, build.maxHp as number) || raw.hp !== build.hp
    || !uint(raw.timeMs, 2 * 60 * 60 * 1000)
    || !uint(raw.kills, 1000000) || !uint(raw.bestStreak, 1000000)
    || !uint(raw.salvageKills, 1000000) || !uint(raw.suppliesCollected, 1000000)
    || !boundedNumber(raw.routePressureMultiplier, 1, 1.5)) return null;
  if (!Array.isArray(raw.cardOfferIds) || raw.cardOfferIds.length > 3
    || new Set(raw.cardOfferIds).size !== raw.cardOfferIds.length
    || raw.cardOfferIds.some((id: unknown) => !cards.has(id as CardId))) return null;
  if (state.phase === 'reward' && wave.decision === 'card' && !raw.cardOfferIds.length) return null;
  if ((state.phase === 'playing' || wave.decision !== 'card') && raw.cardOfferIds.length) return null;
  return raw as unknown as RunSafeSave;
}

export function readRunSafeSave(storage: SafeRunStorage): RunSafeSave | null {
  try {
    const raw = storage.getItem(SAFE_RUN_KEY);
    return raw === null ? null : parseRunSafeSave(JSON.parse(raw));
  } catch { return null; }
}
export function writeRunSafeSave(storage: SafeRunStorage, save: RunSafeSave): boolean {
  if (!parseRunSafeSave(save)) return false;
  try { storage.setItem(SAFE_RUN_KEY, JSON.stringify(save)); return true; }
  catch { return false; }
}
export function clearRunSafeSave(storage: SafeRunStorage): boolean {
  try { storage.removeItem(SAFE_RUN_KEY); return true; }
  catch { return false; }
}
