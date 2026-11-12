/**
 * 《无尽虫潮》migration vertical slice: deterministic, engine-independent combat.
 * This source is imported by BOTH the Cocos Creator component and the browser
 * preview. It does NOT yet implement full M6 campaign/hero/meta progression.
 * No imports from cc, Phaser, DOM or wx are allowed.
 */
import { createRunRandoms, type RunRandomStreams } from './m6/runRandom.ts';
import { DEFAULT_BATTLEFIELD, type BattlefieldId } from './m6/battlefields.ts';
import { xpToNext } from './m6/arsenal.ts';
import { CocosRunController, type CampaignMode, type RunDecision } from './m6/runController.ts';
import { resolvePocHero, POC_WEAPON_RUNTIME, POC_HERO_RUNTIME,
  type PocHeroId, type PocTarget, type PocAttackPort } from './PocRoster.ts';
import type { HeroPassiveRuntime } from './m6/heroRuntime.ts';

export interface Vec2 { x: number; y: number }
export type PocEnemyKind = 'grunt' | 'leaper' | 'armored' | 'boss';
export interface PocPlayer extends Vec2 {
  hp: number;
  maxHp: number;
  stationaryMs: number;
  deployed: boolean;
}
export interface PocEnemy extends Vec2 {
  id: number;
  hp: number;
  /** Optional only to keep old nearestEnemy callers source-compatible. */
  kind?: PocEnemyKind;
  maxHp?: number;
}
export interface PocBullet extends Vec2 {
  vx: number; vy: number; remainingMs: number;
}
export interface PocLightning {
  fromX: number; fromY: number; toX: number; toY: number;
  remainingMs: number; kind?: 'arc' | 'rail';
}
export interface PocState {
  heroId: PocHeroId;
  player: PocPlayer;
  enemies: PocEnemy[];
  bullets: PocBullet[];
  lightning: PocLightning[];
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
    case 'boss': return { hp: 1350, speed: 28, contactRadius: 50, xp: 20 };
  }
}
function clamp(x: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, x));
}
function emptyState(): PocState {
  return {
    heroId: 'marine',
    player: { x: 0, y: 0, hp: 6, maxHp: 6, stationaryMs: 0, deployed: false },
    enemies: [], bullets: [], lightning: [],
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
  private fireCooldownMs = 0;
  private arcCooldownMs = 0;
  private railCooldownMs = 0;
  private spawnCooldownMs = POC.enemySpawnMs;
  private hurtCooldownMs = 0;
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
    this.fireCooldownMs = 0;
    this.arcCooldownMs = 0;
    this.railCooldownMs = 0;
    this.spawnCooldownMs = this.runController.currentWave.spawnIntervalMs;
    this.hurtCooldownMs = 0;
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
    this.state.bossSpawned = false;
    this.spawnCooldownMs = this.runController.currentWave.spawnIntervalMs;
    this.hurtCooldownMs = 0;
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
      playableWeapons: ['rifle', 'arc'],
    });
  }

  private syncRunState(): void {
    const run = this.runController.snapshot();
    this.state.elapsedMs = run.timeMs;
    this.state.wave = run.stage.index + 1;
    this.state.level = run.growth.level;
    this.state.xp = run.growth.xp;
    this.state.xpToNext = xpToNext(run.growth.level);
    this.state.arcUnlocked = run.build.weapons.includes('arc');
    this.state.kills = run.kills;
    this.state.player.hp = run.hp;
    this.state.player.maxHp = run.maxHp;
    this.state.won = run.won;
    this.state.over = run.failed || run.won;
  }
  /** Pause/resume must discard frame debt to prevent lethal catch-up damage. */
  discardFrameDebt(): void { this.accumulatorMs = 0; }
  spawnEnemyAt(x: number, y: number, kind: PocEnemyKind = 'grunt'): void {
    if (this.state.enemies.length >= POC.maxEnemies || this.state.over) return;
    const stats = enemyStats(kind);
    this.state.enemies.push({ id: this.nextId++, kind, x, y, hp: stats.hp, maxHp: stats.hp });
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
    const wave = this.state.wave;
    const profile = this.runController.currentWave;
    // Only three already-implemented enemy behaviors are eligible for the PoC.
    // Original spitter/bomber definitions must wait for real attack drivers.
    const choices = profile.mix.filter(entry =>
      entry.kind === 'grunt' || entry.kind === 'leaper' || entry.kind === 'armored');
    const total = choices.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.nextRandom() * total;
    let kind: PocEnemyKind = 'grunt';
    for (const entry of choices) {
      roll -= entry.weight;
      if (roll <= 0) { kind = entry.kind as PocEnemyKind; break; }
    }
    const angle = this.nextRandom() * Math.PI * 2;
    // Keep spawn points off the player's feet; clip to readable arena.
    const dx = Math.cos(angle) * 185, dy = Math.sin(angle) * 215;
    const x = clamp(player.x + dx, -this.width / 2 + 20, this.width / 2 - 20);
    const y = clamp(player.y + dy, -this.height / 2 + 20, this.height / 2 - 20);
    this.spawnEnemyAt(x, y, kind);
  }
  private resolveDeaths(): void {
    const state = this.state;
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      if (e.hp > 0) continue;
      state.enemies.splice(i, 1);
      this.runController.registerKill(e.kind ?? 'grunt', e.kind === 'boss');
      this.passiveRuntime.onEnemyKilled?.({
        enemyKind: e.kind ?? 'grunt', elite: e.kind === 'boss', timeMs: state.elapsedMs,
      });
      if (e.kind === 'boss') {
        this.runController.tick(0, true);
        this.syncRunState();
      }
    }
  }
  private step(ms: number, move: Vec2): void {
    const state = this.state, player = state.player;
    this.passiveRuntime.onCombatTick?.(ms);
    const seconds = ms / 1000;
    const moving = Math.hypot(move.x, move.y) > 0.07;
    player.x = clamp(player.x + move.x * POC.moveSpeed * seconds,
      -this.width / 2 + 26, this.width / 2 - 26);
    player.y = clamp(player.y + move.y * POC.moveSpeed * seconds,
      -this.height / 2 + 56, this.height / 2 - 90);
    player.stationaryMs = moving ? 0 : player.stationaryMs + ms;
    player.deployed = deploymentReady(player.stationaryMs, moving);
    this.hurtCooldownMs = Math.max(0, this.hurtCooldownMs - ms);
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
    this.spawnCooldownMs -= ms;
    if (this.spawnCooldownMs <= 0) {
      const profile = this.runController.currentWave;
      this.spawnCooldownMs += Math.max(370, profile.spawnIntervalMs);
      const batch = state.wave >= 4 ? 3 : state.wave >= 2 ? 2 : 1;
      for (let i = 0; i < batch; i++) this.spawnWaveEnemy(player);
    }

    for (const e of state.enemies) {
      const dx = player.x - e.x, dy = player.y - e.y;
      const distance = Math.hypot(dx, dy);
      const stats = enemyStats(e.kind ?? 'grunt');
      if (distance > 2) {
        e.x += dx / distance * stats.speed * seconds;
        e.y += dy / distance * stats.speed * seconds;
      }
      if (distance < stats.contactRadius && this.hurtCooldownMs <= 0) {
        this.runController.applyDamage(1);
        this.syncRunState();
        this.hurtCooldownMs = 750;
        if (state.player.hp <= 0) return;
      }
    }

    this.fireCooldownMs -= ms;
    const rifleTarget = nearestEnemy(player, state.enemies, POC.fireRange);
    if (rifleTarget && this.fireCooldownMs <= 0) {
      const angle = Math.atan2(rifleTarget.y - player.y, rifleTarget.x - player.x);
      const rateBonus = 1 + (state.level - 1) * .025;
      this.fireCooldownMs = 255 / (rateBonus * (player.deployed ? POC.deployRateMultiplier : 1));
      POC_WEAPON_RUNTIME.get('rifle')!.attack(rifleTarget, angle, this.attackPort);
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * seconds;
      bullet.y += bullet.vy * seconds;
      bullet.remainingMs -= ms;
      let removed = bullet.remainingMs <= 0;
      if (!removed) for (const e of state.enemies) {
        if (e.hp <= 0 || squaredDistance(bullet, e) > 18 * 18) continue;
        e.hp -= (28 + 3 * (state.level - 1)) * (1 + this.weaponFrameRank * .12)
          * this.deployDamageBonus();
        removed = true;
        break;
      }
      if (removed) state.bullets.splice(i, 1);
    }

    if (state.arcUnlocked) {
      this.arcCooldownMs -= ms;
      const first = nearestEnemy(player, state.enemies, 250);
      if (first && this.arcCooldownMs <= 0) {
        const angle = Math.atan2(first.y - player.y, first.x - player.x);
        POC_WEAPON_RUNTIME.get('arc')!.attack(first, angle, this.attackPort);
        this.arcCooldownMs = 940 / (player.deployed ? POC.deployRateMultiplier : 1);
      }
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
      const p = this.state.player;
      this.state.bullets.push({
        x: p.x, y: p.y,
        vx: Math.cos(angle) * POC.bulletSpeed,
        vy: Math.sin(angle) * POC.bulletSpeed,
        remainingMs: 800,
      });
    },
    arc: (first) => {
      const state = this.state;
      const victims = state.enemies.filter(e => e.hp > 0 && e.id !== first.id
        && squaredDistance(first, e) < 125 * 125)
        .sort((a,b) => squaredDistance(first,a) - squaredDistance(first,b));
      const chain: PocTarget[] = [first, ...victims.slice(0, state.level >= 6 ? 2 : 1)];
      let from: Vec2 = state.player;
      for (const e of chain) {
        state.lightning.push({ fromX: from.x, fromY: from.y,
          toX: e.x, toY: e.y, remainingMs: 160, kind: 'arc' });
        e.hp -= (19 + (state.level - 1) * 2) * this.deployDamageBonus();
        from = e;
      }
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
  private deployDamageBonus(): number {
    if (!this.state.player.deployed) return 1;
    // Kane's real passive rewards deployed fire but DOES NOT disable moving fire.
    return POC.deployDamageMultiplier * (this.heroId === 'kane' ? 1.2 : 1);
  }

}
