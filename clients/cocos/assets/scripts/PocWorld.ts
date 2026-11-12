/**
 * 《无尽虫潮》migration vertical slice: deterministic, engine-independent combat.
 * This source is imported by BOTH the Cocos Creator component and the browser
 * preview. It does NOT yet implement full M6 campaign/hero/meta progression.
 * No imports from cc, Phaser, DOM or wx are allowed.
 */
import { createRunRandoms, type RunRandomStreams } from './m6/runRandom.ts';
import { DEFAULT_BATTLEFIELD, type BattlefieldId } from './m6/battlefields.ts';
import { xpToNext, weaponTuning } from './m6/arsenal.ts';
import { buildWeaponDamage, buildWeaponInterval, GAMEPLAY } from './m6/combat.ts';
import type { WeaponId } from './m6/progression.ts';
import {
  canSpawnElite, MAX_SUPPLIES, SUPPLY_PERIOD_MS, SUPPLY_TTL_MS,
  withinPickupReach, rollSupplyKind, overclockDurationMs, empStats, type SupplyKind,
} from './m6/supplies.ts';
import { CocosRunController, type CampaignMode, type RunDecision } from './m6/runController.ts';
import { resolvePocHero, POC_WEAPON_RUNTIME, POC_HERO_RUNTIME,
  type PocHeroId, type PocAttackPort } from './PocRoster.ts';
import type { HeroPassiveRuntime } from './m6/heroRuntime.ts';

export interface Vec2 { x: number; y: number }
export type PocEnemyKind = 'grunt' | 'leaper' | 'armored' | 'bomber' | 'boss';
export interface PocPlayer extends Vec2 {
  hp: number;
  maxHp: number;
  stationaryMs: number;
  deployed: boolean;
}
export interface PocEnemy extends Vec2 {
  id: number;
  hp: number;
  burnMs?: number;
  burnTickMs?: number;
  burnDamage?: number;
  slowMs?: number;
  elite?: boolean;
  windupMs?: number;
  /** Optional only to keep old nearestEnemy callers source-compatible. */
  kind?: PocEnemyKind;
  maxHp?: number;
}
export interface PocBullet extends Vec2 {
  vx: number; vy: number; remainingMs: number;
  damage: number; source: WeaponId; pierce: number; hitIds: number[];
  knockback?: number;
}
export interface PocLightning {
  fromX: number; fromY: number; toX: number; toY: number;
  remainingMs: number; kind?: 'arc' | 'rail' | 'flame';
}
export interface PocSupply extends Vec2 {
  kind: SupplyKind;
  remainingMs: number;
}
export interface PocPulse extends Vec2 {
  kind: 'bomber' | 'emp';
  radius: number;
  remainingMs: number;
}
export interface PocState {
  heroId: PocHeroId;
  mode: CampaignMode;
  campaignId: string;
  totalStages: number;
  weapons: WeaponId[];
  weaponLevels: Record<WeaponId, number>;
  evolved: Record<WeaponId, boolean>;
  player: PocPlayer;
  enemies: PocEnemy[];
  bullets: PocBullet[];
  lightning: PocLightning[];
  supplies: PocSupply[];
  pulses: PocPulse[];
  overclockMs: number;
  suppliesCollected: number;
  streak: number;
  bestStreak: number;
  streakRemainingMs: number;
  kills: number;
  elapsedMs: number;
  wave: number;
  level: number;
  xp: number;
  xpToNext: number;
  arcUnlocked: boolean;
  bossSpawned: boolean;
  won: boolean;
  over: boolean;
}
export interface PocMetaTuning {
  armorRank?: number;
  weaponFrameRank?: number;
  repairModuleRank?: number;
}

export const POC = {
  fixedStepMs: 1000 / 60,
  moveSpeed: 230,
  fireRange: 340,
  shotIntervalMs: 255,
  bulletSpeed: 750,
  deployDelayMs: 800,
  deployDamageMultiplier: 1.35,
  deployRateMultiplier: 1.25,
  maxEnemies: 40,
  enemySpeed: 46,
  enemySpawnMs: 1750,
  waveDurationMs: 20000,
  maxLevel: 12,
} as const;

export function normalizedMove(x: number, y: number): Vec2 {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
function squaredDistance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
export function nearestEnemy(origin: Vec2, enemies: readonly PocEnemy[], range: number): PocEnemy | null {
  let result: PocEnemy | null = null;
  let distance = range * range;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const next = squaredDistance(origin, enemy);
    if (next <= distance) { result = enemy; distance = next; }
  }
  return result;
}
export function deploymentReady(stationaryMs: number, moving: boolean): boolean {
  return !moving && stationaryMs >= POC.deployDelayMs;
}
export function xpRequired(level: number): number {
  return xpToNext(level);
}
export function enemyStats(kind: PocEnemyKind): { hp: number; speed: number; contactRadius: number; xp: number } {
  switch (kind) {
    case 'grunt': return { hp: 64, speed: 46, contactRadius: 25, xp: 1 };
    case 'leaper': return { hp: 42, speed: 88, contactRadius: 22, xp: 1 };
    case 'armored': return { hp: 180, speed: 27, contactRadius: 31, xp: 3 };
    case 'bomber': return { hp: 56, speed: 102, contactRadius: 24, xp: 2 };
    case 'boss': return { hp: 1350, speed: 28, contactRadius: 50, xp: 20 };
  }
}
function clamp(x: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, x));
}
function emptyState(): PocState {
  return {
    heroId: 'marine', mode: 'prototype', campaignId: '', totalStages: 5,
    weapons: ['rifle'],
    weaponLevels: { rifle: 1, scatter: 0, arc: 0, flame: 0 },
    evolved: { rifle: false, scatter: false, arc: false, flame: false },
    player: { x: 0, y: 0, hp: 6, maxHp: 6, stationaryMs: 0, deployed: false },
    enemies: [], bullets: [], lightning: [], supplies: [], pulses: [],
    overclockMs: 0, suppliesCollected: 0,
    streak: 0, bestStreak: 0, streakRemainingMs: 0,
    kills: 0, elapsedMs: 0, wave: 1, level: 1, xp: 0,
    xpToNext: xpRequired(1), arcUnlocked: false, bossSpawned: false,
    won: false, over: false,
  };
}

/**
 * A small reproducible "five-wave / two weapon" combat slice.
 * There are NO forced XP choice modals; progression is deterministic and
 * intentionally simpler than M6's future hero/weapon progression contract.
 */
export class PocWorld {
  readonly width: number;
  readonly height: number;
  readonly zoneId: BattlefieldId;
  readonly heroId: PocHeroId;
  readonly heroName: string;
  readonly state: PocState;
  private readonly passiveRuntime: Readonly<HeroPassiveRuntime>;
  private readonly armorRank: number;
  private readonly weaponFrameRank: number;
  private readonly repairModuleRank: number;
  private accumulatorMs = 0;
  private readonly weaponCooldownMs: Record<WeaponId, number> = {
    rifle: 0, scatter: 0, arc: 0, flame: 0,
  };
  private railCooldownMs = 0;
  private spawnCooldownMs: number = POC.enemySpawnMs;
  private hurtCooldownMs = 0;
  private supplyCooldownMs = SUPPLY_PERIOD_MS;
  private nextId = 1;
  private randomStreams: RunRandomStreams;
  private readonly initialSeed: number;
  private readonly campaignMode: CampaignMode;
  private runController!: CocosRunController;
  private runSerial = 0;

  constructor(width = 450, height = 800, seed = 12345,
    zoneId: BattlefieldId = DEFAULT_BATTLEFIELD, tuning: PocMetaTuning = {},
    heroId: PocHeroId = 'marine', mode: CampaignMode = 'prototype') {
    const selected = resolvePocHero(heroId); // cannot select an unimplemented loadout
    this.heroId = heroId;
    this.heroName = selected.hero.name;
    this.passiveRuntime = POC_HERO_RUNTIME.get(heroId)!;
    this.width = width;
    this.height = height;
    this.zoneId = zoneId;
    this.armorRank = Math.max(0, Math.min(3, Math.floor(tuning.armorRank ?? 0)));
    this.weaponFrameRank = Math.max(0, Math.min(2, Math.floor(tuning.weaponFrameRank ?? 0)));
    this.repairModuleRank = Math.max(0, Math.min(2, Math.floor(tuning.repairModuleRank ?? 0)));
    this.initialSeed = seed >>> 0;
    this.campaignMode = mode;
    this.runController = this.createRunController();
    this.randomStreams = createRunRandoms(this.initialSeed);
    this.state = emptyState();
    this.state.heroId = this.heroId;
    this.syncRunState();
    this.spawnCooldownMs = this.runController.currentWave.spawnIntervalMs;
    this.spawnEnemyAt(130, 60);
    this.passiveRuntime.onRunStart?.();
  }
  reset(): void {
    Object.assign(this.state, emptyState());
    this.state.heroId = this.heroId;
    this.runController = this.createRunController();
    this.accumulatorMs = 0;
    this.weaponCooldownMs.rifle = 0;
    this.weaponCooldownMs.scatter = 0;
    this.weaponCooldownMs.arc = 0;
    this.weaponCooldownMs.flame = 0;
    this.railCooldownMs = 0;
    this.spawnCooldownMs = this.runController.currentWave.spawnIntervalMs;
    this.hurtCooldownMs = 0;
    this.supplyCooldownMs = SUPPLY_PERIOD_MS;
    this.nextId = 1;
    this.randomStreams = createRunRandoms(this.initialSeed);
    this.syncRunState();
    this.spawnEnemyAt(130, 60);
    this.passiveRuntime.onRunStart?.();
  }

  get decision(): RunDecision | null { return this.runController.snapshot().decision; }
  get currentWaveDurationMs(): number { return this.runController.currentWave.durationMs; }

  chooseDecision(index: number): boolean {
    const decision = this.decision;
    if (!decision || !Number.isInteger(index) || index < 0 || index >= decision.options.length) return false;
    const option = decision.options[index];
    const accepted = decision.kind === 'card'
      ? this.runController.chooseCard(option.id)
      : this.runController.chooseRoute(option.id);
    if (!accepted) return false;
    this.state.enemies.length = 0;
    this.state.bullets.length = 0;
    this.state.lightning.length = 0;
    this.state.supplies.length = 0;
    this.state.pulses.length = 0;
    this.state.overclockMs = 0;
    this.supplyCooldownMs = SUPPLY_PERIOD_MS;
    this.state.bossSpawned = false;
    this.spawnCooldownMs = this.runController.currentWave.spawnIntervalMs;
    this.hurtCooldownMs = 0;
    for (const weapon of ['rifle', 'scatter', 'arc', 'flame'] as const)
      this.weaponCooldownMs[weapon] = 0;
    this.state.player.stationaryMs = 0;
    this.state.player.deployed = false;
    this.syncRunState();
    this.spawnEnemyAt(130, 60);
    return true;
  }

  heal(amount: number): number {
    const hp = this.runController.heal(amount);
    this.syncRunState();
    return hp;
  }

  private createRunController(): CocosRunController {
    this.runSerial++;
    return new CocosRunController({
      seed: this.initialSeed,
      runId: `cocos-${this.initialSeed.toString(16)}-${this.heroId}-${this.runSerial}`,
      mode: this.campaignMode,
      battlefieldId: this.zoneId,
      armorRank: this.armorRank,
      weaponFrameRank: this.weaponFrameRank,
      repairModuleRank: this.repairModuleRank,
      playableWeapons: ['rifle', 'scatter', 'arc', 'flame'],
    });
  }

  private syncRunState(): void {
    const run = this.runController.snapshot();
    this.state.elapsedMs = run.timeMs;
    this.state.mode = run.mode;
    this.state.campaignId = run.campaign.campaignId;
    this.state.totalStages = run.stage.total;
    this.state.wave = run.stage.index + 1;
    this.state.level = run.growth.level;
    this.state.xp = run.growth.xp;
    this.state.xpToNext = xpToNext(run.growth.level);
    this.state.weapons = [...run.build.weapons];
    this.state.weaponLevels = { ...run.growth.weaponLevels };
    this.state.evolved = { ...run.growth.evolved };
    this.state.arcUnlocked = run.build.weapons.includes('arc');
    this.state.streak = run.streak;
    this.state.bestStreak = run.bestStreak;
    this.state.streakRemainingMs = run.streakRemainingMs;
    this.state.kills = run.kills;
    this.state.player.hp = run.hp;
    this.state.player.maxHp = run.maxHp;
    this.state.won = run.won;
    this.state.over = run.failed || run.won;
  }
  /** Pause/resume must discard frame debt to prevent lethal catch-up damage. */
  discardFrameDebt(): void { this.accumulatorMs = 0; }
  spawnEnemyAt(x: number, y: number, kind: PocEnemyKind = 'grunt', elite = false): void {
    if (this.state.enemies.length >= POC.maxEnemies || this.state.over) return;
    const stats = enemyStats(kind);
    const hp = elite ? Math.round(stats.hp * 2.3) : stats.hp;
    this.state.enemies.push({
      id: this.nextId++, kind, x, y, elite, hp, maxHp: hp, windupMs: 0,
    });
  }
  /** Testable M3 spawn port, shared with timed and elite-kill drops. */
  spawnSupplyAt(x: number, y: number, kind?: SupplyKind): void {
    if (this.state.over || this.state.supplies.length >= MAX_SUPPLIES) return;
    const selected = kind ?? rollSupplyKind(
      this.state.player.hp < this.state.player.maxHp, () => this.nextRandom());
    this.state.supplies.push({ kind: selected, x, y, remainingMs: SUPPLY_TTL_MS });
  }
  /** Stable fixed-step update; backlog after a stall is intentionally dropped. */
  advance(frameMs: number, intent: Vec2): void {
    if (this.state.over || this.decision) return;
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.accumulatorMs += Math.min(frameMs, 250);
    const steps = Math.min(5, Math.floor((this.accumulatorMs + 1e-7) / POC.fixedStepMs));
    if (steps === 0) return;
    const move = normalizedMove(intent.x, intent.y);
    for (let i = 0; i < steps && !this.state.over; i++) this.step(POC.fixedStepMs, move);
    this.accumulatorMs = steps === 5 ? 0 : Math.max(0, this.accumulatorMs - steps * POC.fixedStepMs);
  }
  private nextRandom(): number {
    // Visual effects cannot change combat rolls: reuse the M6 domain RNG.
    return this.randomStreams.combat.next();
  }
  private spawnWaveEnemy(player: PocPlayer): void {
    const profile = this.runController.currentWave;
    // Spitter is deferred until its projectile behavior is implemented.
    // Bomber uses a genuine timed fuse with a visible warning and avoidance.
    const choices = profile.mix.filter(entry =>
      entry.kind === 'grunt' || entry.kind === 'leaper'
      || entry.kind === 'armored' || entry.kind === 'bomber');
    const total = choices.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.nextRandom() * total;
    let kind: PocEnemyKind = 'grunt';
    for (const entry of choices) {
      roll -= entry.weight;
      if (roll <= 0) { kind = entry.kind as PocEnemyKind; break; }
    }
    const angle = this.nextRandom() * Math.PI * 2;
    // M5.3 safety: clipping a nominal off-screen spawn to the arena boundary
    // can place it directly on a hero standing at that same boundary.
    // Try evenly distributed sectors with NO extra RNG rolls, so fixed seeds
    // are stable while at least 140 world units of player clearance is kept.
    let location: Vec2 = { x: 0, y: 0 };
    let farthestSq = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const sector = angle + attempt * Math.PI / 4;
      const candidate = {
        x: clamp(player.x + Math.cos(sector) * 185, -this.width / 2 + 20, this.width / 2 - 20),
        y: clamp(player.y + Math.sin(sector) * 215, -this.height / 2 + 20, this.height / 2 - 20),
      };
      const distanceSq = squaredDistance(candidate, player);
      if (distanceSq > farthestSq) { location = candidate; farthestSq = distanceSq; }
      if (distanceSq >= 140 * 140) { location = candidate; break; }
    }
    const { x, y } = location;
    const livingElites = this.state.enemies.filter(e => e.hp > 0 && e.elite).length;
    const elite = canSpawnElite(this.runController.currentStage.encounter.pressureTier,
      kind, livingElites, () => this.nextRandom());
    this.spawnEnemyAt(x, y, kind, elite);
  }
  private updateSupplies(ms: number, magnet: boolean): void {
    const state = this.state;
    for (let i = state.supplies.length - 1; i >= 0; i--) {
      const item = state.supplies[i];
      item.remainingMs -= ms;
      if (withinPickupReach(squaredDistance(state.player, item), magnet)) {
        state.supplies.splice(i, 1);
        state.suppliesCollected++;
        if (item.kind === 'repair') {
          this.runController.heal(2);
          this.syncRunState();
        } else if (item.kind === 'overclock') {
          state.overclockMs = Math.max(state.overclockMs,
            overclockDurationMs(this.runController.snapshot().build.surgeCell));
        } else {
          const stats = empStats(this.runController.snapshot().build.empArray);
          state.pulses.push({ x: state.player.x, y: state.player.y,
            kind: 'emp', radius: stats.radius, remainingMs: 400 });
          const origin = { x: state.player.x, y: state.player.y };
          for (const enemy of state.enemies) {
            if (enemy.hp > 0 && squaredDistance(origin, enemy) <= stats.radius * stats.radius)
              enemy.hp -= stats.damage;
          }
        }
      } else if (item.remainingMs <= 0) state.supplies.splice(i, 1);
    }
  }

  private resolveDeaths(): void {
    const state = this.state;
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      if (e.hp > 0) continue;
      state.enemies.splice(i, 1);
      if (e.kind === 'bomber' && e.windupMs === -1) continue;
      this.runController.registerKill(e.kind ?? 'grunt', Boolean(e.elite));
      this.passiveRuntime.onEnemyKilled?.({
        enemyKind: e.kind ?? 'grunt', elite: Boolean(e.elite), timeMs: state.elapsedMs,
      });
      // M3: elite deaths always drop one collectible, unless the capped
      // supply inventory is already full.
      if (e.elite) this.spawnSupplyAt(e.x, e.y);
      if (e.kind === 'boss') {
        this.runController.tick(0, true);
        this.syncRunState();
      }
    }
  }
  private step(ms: number, move: Vec2): void {
    const state = this.state, player = state.player;
    const run = this.runController.snapshot();
    const build = run.build;
    this.passiveRuntime.onCombatTick?.(ms);
    const seconds = ms / 1000;
    const moving = Math.hypot(move.x, move.y) > 0.07;
    player.x = clamp(player.x + move.x * POC.moveSpeed * build.speed * seconds,
      -this.width / 2 + 26, this.width / 2 - 26);
    player.y = clamp(player.y + move.y * POC.moveSpeed * build.speed * seconds,
      -this.height / 2 + 56, this.height / 2 - 90);
    player.stationaryMs = moving ? 0 : player.stationaryMs + ms;
    player.deployed = deploymentReady(player.stationaryMs, moving);
    this.hurtCooldownMs = Math.max(0, this.hurtCooldownMs - ms);
    state.overclockMs = Math.max(0, state.overclockMs - ms);
    this.updateSupplies(ms, build.supplyMagnet);
    for (let i = state.pulses.length - 1; i >= 0; i--) {
      state.pulses[i].remainingMs -= ms;
      if (state.pulses[i].remainingMs <= 0) state.pulses.splice(i, 1);
    }
    for (let i = state.lightning.length - 1; i >= 0; i--) {
      const segment = state.lightning[i];
      segment.remainingMs -= ms;
      if (segment.remainingMs <= 0) state.lightning.splice(i, 1);
    }

    const stage = this.runController.currentStage;
    const stageElapsedMs = this.runController.snapshot().campaign.elapsedMs;
    if (stage.encounter.kind === 'boss' && !state.bossSpawned && stageElapsedMs > 2500) {
      // Reserve the boss slot even if the previous wave reached its enemy cap.
      if (state.enemies.length >= POC.maxEnemies) {
        const expendable = state.enemies.findIndex(e => e.kind !== 'boss');
        if (expendable >= 0) state.enemies.splice(expendable, 1);
      }
      this.spawnEnemyAt(clamp(player.x + 135, -this.width/2+30, this.width/2-30),
        clamp(player.y + 160, -this.height/2+30, this.height/2-30), 'boss');
      state.bossSpawned = state.enemies.some(e => e.kind === 'boss');
    }
    this.supplyCooldownMs -= ms;
    if (this.supplyCooldownMs <= 0) {
      this.supplyCooldownMs += SUPPLY_PERIOD_MS;
      const angle = this.nextRandom() * Math.PI * 2;
      const radius = 145 + this.nextRandom() * 90;
      this.spawnSupplyAt(
        clamp(player.x + Math.cos(angle) * radius, -this.width / 2 + 20, this.width / 2 - 20),
        clamp(player.y + Math.sin(angle) * radius, -this.height / 2 + 20, this.height / 2 - 20),
      );
    }
    this.spawnCooldownMs -= ms;
    if (this.spawnCooldownMs <= 0) {
      const profile = this.runController.currentWave;
      this.spawnCooldownMs += Math.max(370, profile.spawnIntervalMs);
      const batch = state.wave >= 4 ? 3 : state.wave >= 2 ? 2 : 1;
      for (let i = 0; i < batch; i++) this.spawnWaveEnemy(player);
    }

    for (const e of state.enemies) {
      if ((e.burnMs ?? 0) > 0) {
        e.burnMs = Math.max(0, (e.burnMs ?? 0) - ms);
        e.burnTickMs = (e.burnTickMs ?? 250) - ms;
        if (e.burnTickMs <= 0) {
          e.burnTickMs += 250;
          e.hp -= e.burnDamage ?? 0;
        }
      }
      e.slowMs = Math.max(0, (e.slowMs ?? 0) - ms);
      if (e.hp <= 0) continue;
      const dx = player.x - e.x, dy = player.y - e.y;
      const distance = Math.hypot(dx, dy);
      const stats = enemyStats(e.kind ?? 'grunt');
      // M2 self-destructing bug: a visible 850ms red radius, no instant
      // contact damage. Killing it or moving outside 105px avoids the blast.
      if (e.kind === 'bomber') {
        if ((e.windupMs ?? 0) > 0) {
          e.windupMs = Math.max(0, (e.windupMs ?? 0) - ms);
          if (e.windupMs <= 0) {
            state.pulses.push({ x: e.x, y: e.y, kind: 'bomber',
              radius: 105, remainingMs: 300 });
            e.hp = -1;
            // Mark a detonated bomber so resolveDeaths never grants XP/kills.
            e.windupMs = -1;
            if (distance <= 105 && this.hurtCooldownMs <= 0) {
              this.runController.applyDamage(2);
              this.syncRunState();
              this.hurtCooldownMs = GAMEPLAY.hitGraceMs;
              if (state.player.hp <= 0) return;
            }
          }
          continue;
        }
        if (distance < 110) { e.windupMs = 850; continue; }
      }
      const slow = (e.slowMs ?? 0) > 0 ? 0.6 : 1;
      if (distance > 2) {
        const eliteSpeed = e.elite ? 1.12 : 1;
        e.x += dx / distance * stats.speed * eliteSpeed * slow * seconds;
        e.y += dy / distance * stats.speed * eliteSpeed * slow * seconds;
      }
      if (e.kind !== 'bomber' && distance < stats.contactRadius && this.hurtCooldownMs <= 0) {
        this.runController.applyDamage(1);
        this.syncRunState();
        this.hurtCooldownMs = GAMEPLAY.hitGraceMs;
        if (state.player.hp <= 0) return;
      }
    }

    // Each equipped *ordinary* weapon owns its cooldown and main-M6 tuning.
    // No free Lv.3 arc unlocks: installation requires a legal encounter card.
    for (const id of build.weapons) {
      this.weaponCooldownMs[id] = Math.max(0, this.weaponCooldownMs[id] - ms);
      const driver = POC_WEAPON_RUNTIME.get(id);
      if (!driver) throw new Error('Missing executable weapon driver: ' + id);
      const tuning = weaponTuning(run.growth, id);
      const range = driver.baseRange * build.range * tuning.range;
      const target = nearestEnemy(player, state.enemies, range);
      if (!target || this.weaponCooldownMs[id] > 0) continue;
      const angle = Math.atan2(target.y - player.y, target.x - player.x);
      driver.attack(target, angle, this.attackPort);
      this.weaponCooldownMs[id] = buildWeaponInterval(
        driver.baseIntervalMs, build, player.deployed, false, state.overclockMs > 0,
      ) * tuning.interval;
    }

    // Projectile collision resolves independently from firing, even while moving.
    for (let index = state.bullets.length - 1; index >= 0; index--) {
      const bullet = state.bullets[index];
      const oldX = bullet.x, oldY = bullet.y;
      bullet.x += bullet.vx * seconds;
      bullet.y += bullet.vy * seconds;
      bullet.remainingMs -= ms;
      let consumed = bullet.remainingMs <= 0;
      if (!consumed) for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || bullet.hitIds.includes(enemy.id)) continue;
        const dx = bullet.x - oldX, dy = bullet.y - oldY;
        const distanceSq = dx * dx + dy * dy;
        const t = distanceSq > 0 ? clamp(((enemy.x - oldX) * dx + (enemy.y - oldY) * dy)
          / distanceSq, 0, 1) : 0;
        const hitX = oldX + dx * t, hitY = oldY + dy * t;
        if (squaredDistance({ x: hitX, y: hitY }, enemy) > 18 * 18) continue;
        enemy.hp -= bullet.damage;
        bullet.hitIds.push(enemy.id);
        if (bullet.knockback && enemy.hp > 0) {
          const awayX = enemy.x - player.x, awayY = enemy.y - player.y;
          const distance = Math.max(1, Math.hypot(awayX, awayY));
          enemy.x = clamp(enemy.x + bullet.knockback * awayX / distance,
            -this.width / 2 + 20, this.width / 2 - 20);
          enemy.y = clamp(enemy.y + bullet.knockback * awayY / distance,
            -this.height / 2 + 20, this.height / 2 - 20);
        }
        if (bullet.hitIds.length > bullet.pierce) { consumed = true; break; }
      }
      if (consumed) state.bullets.splice(index, 1);
    }

    if (this.heroId === 'kane') {
      this.railCooldownMs -= ms;
      const target = nearestEnemy(player, state.enemies, 380);
      if (target && this.railCooldownMs <= 0) {
        const angle = Math.atan2(target.y - player.y, target.x - player.x);
        POC_WEAPON_RUNTIME.get('kane-rail')!.attack(target, angle, this.attackPort);
        this.railCooldownMs = 2050 / (player.deployed ? POC.deployRateMultiplier : 1);
      }
    }
    this.resolveDeaths();
    if (!state.over) {
      this.runController.tick(ms);
      this.syncRunState();
      if (this.decision) {
        state.enemies.length = 0;
        state.bullets.length = 0;
        state.lightning.length = 0;
      }
    }
  }
  /**
   * M6 attack drivers invoke these ports. They mutate only the world state,
   * never a Phaser/Cocos Sprite. Both browser and Creator call the same code.
   */
  private readonly attackPort: PocAttackPort = {
    rifle: (_target, angle) => {
      const run = this.runController.snapshot();
      const tuning = weaponTuning(run.growth, 'rifle');
      this.emitBullet(angle, 'rifle',
        this.weaponDamage(GAMEPLAY.bulletDamage * tuning.damage, run.build, run.streak)
        * (1 + this.weaponFrameRank * .025),
        run.build.pierce + tuning.pierce);
    },
    scatter: (_target, angle) => {
      const run = this.runController.snapshot();
      const tuning = weaponTuning(run.growth, 'scatter');
      const base = this.weaponDamage(19 * tuning.damage, run.build, run.streak);
      const center = (tuning.pellets - 1) / 2;
      for (let i = 0; i < tuning.pellets; i++) {
        this.emitBullet(angle + (i - center) * .112, 'scatter',
          base, run.build.pierce, tuning.knockback);
      }
    },
    arc: (first) => {
      const run = this.runController.snapshot();
      const tuning = weaponTuning(run.growth, 'arc');
      let from: Vec2 = this.state.player;
      let current: PocEnemy | undefined = this.state.enemies.find(e => e.id === first.id);
      const chained = new Set<number>();
      for (let index = 0; index < tuning.chains && current; index++) {
        const victim: PocEnemy = current;
        chained.add(victim.id);
        this.state.lightning.push({
          fromX: from.x, fromY: from.y, toX: victim.x, toY: victim.y,
          remainingMs: 160, kind: 'arc',
        });
        victim.hp -= this.weaponDamage((index === 0 ? 38 : 25) * tuning.damage,
          run.build, run.streak);
        if (run.build.frost || tuning.shockMs > 0)
          victim.slowMs = Math.max(victim.slowMs ?? 0, tuning.shockMs || 1000);
        from = victim;
        const chainRangeSq = (tuning.chainRange * run.build.range) ** 2;
        current = this.state.enemies
          .filter(e => e.hp > 0 && !chained.has(e.id) && squaredDistance(victim, e) < chainRangeSq)
          .sort((a,b) => squaredDistance(victim,a) - squaredDistance(victim,b))[0];
      }
    },
    flame: (_target, angle) => {
      const run = this.runController.snapshot();
      const tuning = weaponTuning(run.growth, 'flame');
      const player = this.state.player;
      const range = 190 * run.build.range * tuning.range;
      const coneCosine = Math.cos(Math.min(1.2, tuning.coneHalfAngle * run.build.range));
      for (const enemy of this.state.enemies) {
        if (enemy.hp <= 0) continue;
        const dx = enemy.x - player.x, dy = enemy.y - player.y;
        const len = Math.hypot(dx, dy);
        if (len <= 0 || len > range) continue;
        if ((dx * Math.cos(angle) + dy * Math.sin(angle)) / len < coneCosine) continue;
        enemy.hp -= this.weaponDamage(9 * tuning.damage, run.build, run.streak);
        if (enemy.hp <= 0) continue;
        if (tuning.burnDurationMs > 0) {
          if ((enemy.burnMs ?? 0) <= 0) enemy.burnTickMs = 250;
          enemy.burnMs = tuning.burnDurationMs;
          enemy.burnDamage = this.weaponDamage(tuning.burnTickDamage, run.build, run.streak);
        }
        if (run.build.frost) enemy.slowMs = Math.max(enemy.slowMs ?? 0, 1000);
      }
      this.state.lightning.push({ fromX: player.x, fromY: player.y,
        toX: player.x + Math.cos(angle) * range, toY: player.y + Math.sin(angle) * range,
        remainingMs: 135, kind: 'flame' });
    },
    rail: (_target, angle) => {
      const state = this.state, player = state.player;
      const range = 380;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      // First bullet pierces a narrow corridor along its direction.
      const victims = state.enemies
        .filter(e => {
          if (e.hp <= 0) return false;
          const x = e.x - player.x, y = e.y - player.y;
          const along = x * direction.x + y * direction.y;
          const sideways = Math.abs(x * direction.y - y * direction.x);
          return along >= 0 && along <= range && sideways <= (e.kind === 'boss' ? 33 : 23);
        })
        .sort((a,b) => squaredDistance(player,a) - squaredDistance(player,b))
        .slice(0, 3);
      // A real rail beam fires even when no secondary target is aligned.
      for (const e of victims) {
        e.hp -= (95 + 5 * (state.level - 1)) * (1 + this.weaponFrameRank * .12)
          * this.deployDamageBonus();
      }
      state.lightning.push({
        fromX: player.x, fromY: player.y,
        toX: player.x + direction.x * range, toY: player.y + direction.y * range,
        remainingMs: 190, kind: 'rail',
      });
    },
  };
  private emitBullet(angle: number, source: WeaponId, damage: number,
    pierce: number, knockback = 0): void {
    const player = this.state.player;
    this.state.bullets.push({
      x: player.x, y: player.y,
      vx: Math.cos(angle) * GAMEPLAY.projectileSpeed,
      vy: Math.sin(angle) * GAMEPLAY.projectileSpeed,
      remainingMs: GAMEPLAY.projectileLifetimeMs,
      damage, source, pierce, hitIds: [], knockback,
    });
  }
  private weaponDamage(base: number, build: ReturnType<CocosRunController['snapshot']>['build'],
    streak: number): number {
    const canon = buildWeaponDamage(base, build, this.state.player.deployed, false, streak);
    return canon * (this.state.player.deployed && this.heroId === 'kane' ? 1.2 : 1);
  }
  private deployDamageBonus(): number {
    if (!this.state.player.deployed) return 1;
    // Kane's real passive rewards deployed fire but DOES NOT disable moving fire.
    return POC.deployDamageMultiplier * (this.heroId === 'kane' ? 1.2 : 1);
  }

}
