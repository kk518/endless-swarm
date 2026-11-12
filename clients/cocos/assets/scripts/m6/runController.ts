/**
 * Engine-neutral run orchestration for the Cocos client.
 * This layer owns campaign phases, reward legality and automatic XP growth;
 * renderers and battle simulation only submit time, kills and player choices.
 */
import {
  PROTOTYPE_CAMPAIGN, THREE_ACT_BLUEPRINT, beginCampaign, tickCampaign,
  advanceCampaignReward, getEncounter, type CampaignDefinition,
  type CampaignRunState, type EncounterView, type CampaignPhase,
} from './campaignDirector.ts';
import {
  newBuild, eligibleCards, rollCards, applyCard, type RunBuild,
  type CardDef, type CardId, type WeaponId, type EnemyKind, type WaveDef,
} from './progression.ts';
import {
  newGrowth, grantExperience, killExperience, installWeaponCalibration,
  evolutionRecipeTargets, type GrowthState,
} from './arsenal.ts';
import {
  applyAutomaticLevels, applyAutomaticEvolutions, DEFAULT_TRAINING,
  type TrainingPlan, type TrainingFocus, type AutomaticGrowthResult,
} from './autoGrowth.ts';
import { createRunRandoms, type RunRandomStreams } from './runRandom.ts';
import {
  eligibleRouteChoices, resolveRouteChoice, type RouteChoice,
} from './routeDecisions.ts';
import {
  battlefieldWave, DEFAULT_BATTLEFIELD, type BattlefieldId,
} from './battlefields.ts';
import { advanceStreak } from './streak.ts';

export type CampaignMode = 'prototype' | 'expedition';
export type RunDecision =
  | { readonly kind: 'card'; readonly options: readonly CardDef[] }
  | { readonly kind: 'route'; readonly options: readonly RouteChoice[] };

export interface RunControllerOptions {
  readonly seed: number;
  readonly runId: string;
  readonly mode?: CampaignMode;
  readonly battlefieldId?: BattlefieldId;
  readonly armorRank?: number;
  readonly weaponFrameRank?: number;
  readonly repairModuleRank?: number;
  readonly playableWeapons?: readonly WeaponId[];
}

export interface RunControllerSnapshot {
  readonly mode: CampaignMode;
  readonly phase: CampaignPhase;
  readonly campaign: CampaignRunState;
  readonly stage: EncounterView;
  readonly build: RunBuild;
  readonly growth: GrowthState;
  readonly training: TrainingPlan;
  readonly hp: number;
  readonly maxHp: number;
  readonly timeMs: number;
  readonly kills: number;
  readonly streak: number;
  readonly bestStreak: number;
  readonly routePressureMultiplier: number;
  readonly decision: RunDecision | null;
  readonly failed: boolean;
  readonly won: boolean;
}

export interface KillGrowthResult {
  readonly xp: number;
  readonly gainedLevels: number;
  readonly automatic: AutomaticGrowthResult;
  readonly streak: number;
  readonly bestStreak: number;
}

function cloneBuild(build: RunBuild): RunBuild {
  return { ...build, weapons: [...build.weapons], selected: [...build.selected] };
}
function cloneGrowth(growth: GrowthState): GrowthState {
  return { ...growth, weaponLevels: { ...growth.weaponLevels }, evolved: { ...growth.evolved } };
}

/** Shared M0–M6 run state machine. No Cocos, Phaser, DOM or wx imports. */
export class CocosRunController {
  readonly mode: CampaignMode;
  readonly runId: string;
  readonly battlefieldId: BattlefieldId;
  readonly armorRank: number;
  readonly weaponFrameRank: number;
  readonly repairModuleRank: number;

  private readonly campaign: CampaignDefinition;
  private readonly playableWeapons: ReadonlySet<WeaponId>;
  private readonly randoms: RunRandomStreams;
  private campaignRun: CampaignRunState;
  private build: RunBuild;
  private growth: GrowthState;
  private training: TrainingPlan = { ...DEFAULT_TRAINING };
  private hp: number;
  private timeMs = 0;
  private kills = 0;
  private streak = 0;
  private lastKillMs = -10000;
  private bestStreak = 0;
  private salvageKills = 0;
  private routePressureMultiplier = 1;
  private decision: RunDecision | null = null;
  // Keep the full validated fork; the UI receives only currently survivable options.
  private routeSourceOptions: readonly RouteChoice[] = [];
  private failed = false;
  private won = false;

  constructor(options: RunControllerOptions) {
    if (!/^[a-z0-9-]{8,128}$/.test(options.runId)) throw new Error('Invalid run id');
    this.mode = options.mode ?? 'prototype';
    this.runId = options.runId;
    this.battlefieldId = options.battlefieldId ?? DEFAULT_BATTLEFIELD;
    this.armorRank = Math.max(0, Math.min(3, Math.floor(options.armorRank ?? 0)));
    this.weaponFrameRank = Math.max(0, Math.min(2, Math.floor(options.weaponFrameRank ?? 0)));
    this.repairModuleRank = Math.max(0, Math.min(2, Math.floor(options.repairModuleRank ?? 0)));
    this.campaign = this.mode === 'expedition' ? THREE_ACT_BLUEPRINT : PROTOTYPE_CAMPAIGN;
    this.campaignRun = beginCampaign(this.campaign, options.seed);
    this.randoms = createRunRandoms(options.seed);
    this.build = newBuild();
    this.growth = newGrowth();
    this.hp = this.build.maxHp + this.armorRank;
    this.build.maxHp = this.hp;
    this.build.hp = this.hp;
    this.playableWeapons = new Set(options.playableWeapons
      ?? ['rifle', 'scatter', 'arc', 'flame']);
  }

  get currentStage(): EncounterView {
    return getEncounter(this.campaign, this.campaignRun.stageIndex);
  }

  get currentWave(): WaveDef {
    return battlefieldWave(this.battlefieldId, this.currentStage.encounter.wave);
  }

  snapshot(): RunControllerSnapshot {
    const campaign = { ...this.campaignRun };
    const stage = this.currentStage;
    const decision = this.decision?.kind === 'card'
      ? { kind: 'card' as const, options: [...this.decision.options] }
      : this.decision?.kind === 'route'
        ? { kind: 'route' as const, options: [...this.decision.options] } : null;
    return {
      mode: this.mode, phase: this.campaignRun.phase, campaign, stage,
      build: cloneBuild(this.build), growth: cloneGrowth(this.growth),
      training: { ...this.training }, hp: this.hp, maxHp: this.build.maxHp,
      timeMs: this.timeMs, kills: this.kills, streak: this.streak,
      bestStreak: this.bestStreak, routePressureMultiplier: this.routePressureMultiplier,
      decision, failed: this.failed, won: this.won,
    };
  }

  /** Advance only while playing. Reward screens and terminal states freeze time. */
  tick(deltaMs: number, bossKilled = false): RunControllerSnapshot {
    if (this.failed || this.won || this.campaignRun.phase !== 'playing') return this.snapshot();
    const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.timeMs += delta;
    this.campaignRun = tickCampaign(this.campaign, this.campaignRun, delta, bossKilled);
    if (this.campaignRun.phase === 'reward') this.prepareDecision();
    else if (this.campaignRun.phase === 'victory') this.won = true;
    else if (this.campaignRun.phase === 'timeout') this.failed = true;
    return this.snapshot();
  }

  /** Kills grant direct XP; every gained level is allocated immediately without a modal. */
  registerKill(kind: EnemyKind, elite = false): KillGrowthResult | null {
    if (this.failed || this.won || this.campaignRun.phase !== 'playing') return null;
    this.kills++;
    const xp = killExperience(kind, elite);
    const experience = grantExperience(this.growth, xp);
    this.growth = experience.state;
    const automatic = applyAutomaticLevels(this.build, this.growth, experience.gainedLevels, this.training);
    this.hp = this.build.hp;
    this.streak = advanceStreak(this.streak, this.lastKillMs, this.timeMs);
    this.lastKillMs = this.timeMs;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (this.build.salvage && ++this.salvageKills >= 20) {
      this.salvageKills = 0;
      this.applyHealing(1);
    }
    return { xp, gainedLevels: experience.gainedLevels, automatic,
      streak: this.streak, bestStreak: this.bestStreak };
  }

  heal(amount: number): number {
    if (this.failed || this.won) return this.hp;
    const healing = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    this.hp = Math.min(this.build.maxHp, this.hp + healing);
    this.build.hp = this.hp;
    return this.hp;
  }

  applyDamage(amount: number): number {
    if (this.failed || this.won || this.campaignRun.phase !== 'playing') return this.hp;
    const damage = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    this.hp = Math.max(0, this.hp - damage);
    this.build.hp = this.hp;
    if (this.hp <= 0) this.failed = true;
    return this.hp;
  }

  setTraining(weapon: WeaponId, focus: TrainingFocus): void {
    if (!['damage', 'rate', 'speed'].includes(focus)) return;
    if (this.build.weapons.includes(weapon)) this.training.weapon = weapon;
    this.training.focus = focus;
  }

  chooseCard(cardId: string): boolean {
    if (this.failed || this.won || this.campaignRun.phase !== 'reward'
      || this.decision?.kind !== 'card') return false;
    const chosen = this.decision.options.find(card => card.id === cardId);
    if (!chosen || (chosen.weapon && !this.playableWeapons.has(chosen.weapon))) return false;
    this.build.hp = this.hp;
    if (!applyCard(this.build, cardId as CardId)) return false;
    this.hp = this.build.hp;
    if (chosen.weapon) installWeaponCalibration(this.growth, chosen.weapon);
    applyAutomaticEvolutions(this.build, this.growth);
    this.routePressureMultiplier = 1;
    this.advanceAfterDecision(1 + this.repairModuleRank);
    return true;
  }

  chooseRoute(routeId: string): boolean {
    if (this.failed || this.won || this.campaignRun.phase !== 'reward'
      || this.decision?.kind !== 'route') return false;
    const effect = resolveRouteChoice(this.routeSourceOptions, routeId, this.hp, this.build.maxHp);
    if (!effect) return false;
    this.hp = effect.hp;
    this.build.hp = this.hp;
    this.build.damage *= effect.runDamageMultiplier;
    this.advanceAfterDecision(0);
    this.routePressureMultiplier = effect.nextPressureMultiplier;
    return true;
  }

  private prepareDecision(): void {
    const stage = this.currentStage;
    if (stage.encounter.decision === 'route') {
      this.routeSourceOptions = stage.encounter.routes ?? [];
      this.decision = {
        kind: 'route',
        options: eligibleRouteChoices(this.routeSourceOptions, this.hp),
      };
      if (this.decision.options.length === 0) throw new Error('No legal route choices');
      return;
    }
    if (stage.encounter.decision !== 'card') {
      throw new Error('A non-final encounter must offer a decision');
    }
    const random = () => this.randoms.rewards.next();
    const preferred = evolutionRecipeTargets(this.build, this.growth);
    const rolled = rollCards(this.build, stage.index + 1, random, preferred);
    const options = rolled.filter(card => !card.weapon || this.playableWeapons.has(card.weapon));
    const pool = eligibleCards(this.build).filter(card =>
      !card.weapon || this.playableWeapons.has(card.weapon));
    // Canonical rollCards can pick an unimplemented weapon before our driver
    // filter runs. Preserve its early visible-hardpoint guarantee using only
    // executable attack drivers; metadata alone must not grant a weapon.
    const availableWeapons = pool.filter(card => card.weapon);
    if (stage.index < 4 && availableWeapons.length > 0 && !options.some(card => card.weapon)) {
      const index = Math.min(availableWeapons.length - 1, Math.floor(random() * availableWeapons.length));
      options.unshift(availableWeapons[index]);
      if (options.length > 3) options.pop();
    }
    while (options.length < 3) {
      const remaining = pool.filter(card => !options.some(option => option.id === card.id));
      if (remaining.length === 0) break;
      const index = Math.min(remaining.length - 1, Math.floor(Math.max(0, random()) * remaining.length));
      options.push(remaining[index]);
    }
    if (options.length === 0) throw new Error('No legal card rewards');
    this.decision = { kind: 'card', options };
  }

  private advanceAfterDecision(fieldRepair: number): void {
    this.streak = 0;
    this.lastKillMs = -10000;
    this.applyHealing(fieldRepair);
    this.campaignRun = advanceCampaignReward(this.campaign, this.campaignRun);
    this.decision = null;
    this.routeSourceOptions = [];
  }

  private applyHealing(amount: number): void {
    const healing = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
    this.hp = Math.min(this.build.maxHp, this.hp + healing);
    this.build.hp = this.hp;
  }
}
