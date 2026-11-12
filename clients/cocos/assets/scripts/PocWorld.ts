/**
 * Cocos migration PoC: pure TypeScript battle rules.
 * This file deliberately imports NO 'cc', Phaser, browser DOM, or WeChat API.
 * Node tests import this same file; Cocos imports it from PocBattle.
 *
 * IMPORTANT: this is a minimal implementation for engine/platform proof,
 * not a replacement for the production M5/M6 combat rules. Full parity is G2/G3.
 */
export interface Vec2 { x: number; y: number }
export interface PocPlayer extends Vec2 {
  hp: number;
  stationaryMs: number;
  deployed: boolean;
}
export interface PocEnemy extends Vec2 { id: number; hp: number }
export interface PocBullet extends Vec2 { vx: number; vy: number; remainingMs: number }
export interface PocState {
  player: PocPlayer;
  enemies: PocEnemy[];
  bullets: PocBullet[];
  kills: number;
  elapsedMs: number;
  over: boolean;
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
  maxEnemies: 9,
  enemySpeed: 46,
  enemySpawnMs: 1750,
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
function clamp(x: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, x));
}

/** Fixed step, seeded spawn, one rifle, one enemy class, no presentation dependencies. */
export class PocWorld {
  readonly state: PocState;
  private accumulatorMs = 0;
  private fireCooldownMs = 0;
  private spawnCooldownMs = POC.enemySpawnMs;
  private hurtCooldownMs = 0;
  private nextId = 1;
  private randomState: number;
  private readonly initialSeed: number;

  constructor(
    public readonly width = 450,
    public readonly height = 800,
    seed = 12345,
  ) {
    this.initialSeed = seed >>> 0;
    this.randomState = this.initialSeed;
    this.state = { player: { x: 0, y: 0, hp: 6, stationaryMs: 0, deployed: false },
      enemies: [], bullets: [], kills: 0, elapsedMs: 0, over: false };
    this.spawnEnemyAt(130, 60);
  }
  reset(): void {
    this.state.player = { x: 0, y: 0, hp: 6, stationaryMs: 0, deployed: false };
    this.state.enemies = [];
    this.state.bullets = [];
    this.state.kills = 0;
    this.state.elapsedMs = 0;
    this.state.over = false;
    this.accumulatorMs = 0;
    this.fireCooldownMs = 0;
    this.spawnCooldownMs = POC.enemySpawnMs;
    this.hurtCooldownMs = 0;
    this.nextId = 1;
    this.randomState = this.initialSeed;
    this.spawnEnemyAt(130, 60);
  }
  /** Pause/resume must discard frame debt to prevent catch-up damage/bullets. */
  discardFrameDebt(): void { this.accumulatorMs = 0; }
  spawnEnemyAt(x: number, y: number): void {
    if (this.state.enemies.length >= POC.maxEnemies || this.state.over) return;
    this.state.enemies.push({ id: this.nextId++, x, y, hp: 64 });
  }
  /** At most five sim steps per render frame; old backlog is discarded. */
  advance(frameMs: number, intent: Vec2): void {
    if (this.state.over) return;
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.accumulatorMs += Math.min(frameMs, 250);
    const steps = Math.min(5, Math.floor((this.accumulatorMs + 1e-7) / POC.fixedStepMs));
    if (steps === 0) return;
    const move = normalizedMove(intent.x, intent.y);
    for (let i = 0; i < steps && !this.state.over; i++) this.step(POC.fixedStepMs, move);
    this.accumulatorMs = steps === 5 ? 0 : Math.max(0, this.accumulatorMs - steps * POC.fixedStepMs);
  }
  private nextRandom(): number {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
  private step(ms: number, move: Vec2): void {
    const state = this.state;
    const player = state.player;
    state.elapsedMs += ms;
    const seconds = ms / 1000;
    const moving = Math.hypot(move.x, move.y) > 0.07;
    player.x = clamp(player.x + move.x * POC.moveSpeed * seconds, -this.width / 2 + 26, this.width / 2 - 26);
    player.y = clamp(player.y + move.y * POC.moveSpeed * seconds, -this.height / 2 + 56, this.height / 2 - 90);
    player.stationaryMs = moving ? 0 : player.stationaryMs + ms;
    player.deployed = deploymentReady(player.stationaryMs, moving);
    this.hurtCooldownMs = Math.max(0, this.hurtCooldownMs - ms);

    this.spawnCooldownMs -= ms;
    if (this.spawnCooldownMs <= 0) {
      this.spawnCooldownMs += POC.enemySpawnMs;
      const angle = this.nextRandom() * Math.PI * 2;
      this.spawnEnemyAt(
        clamp(player.x + Math.cos(angle) * 180, -this.width / 2 + 15, this.width / 2 - 15),
        clamp(player.y + Math.sin(angle) * 220, -this.height / 2 + 15, this.height / 2 - 15),
      );
    }

    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x, dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 2) {
        enemy.x += dx / distance * POC.enemySpeed * seconds;
        enemy.y += dy / distance * POC.enemySpeed * seconds;
      }
      if (distance < 25 && this.hurtCooldownMs === 0) {
        player.hp--;
        this.hurtCooldownMs = 750;
        if (player.hp <= 0) { state.over = true; return; }
      }
    }

    this.fireCooldownMs -= ms;
    const target = nearestEnemy(player, state.enemies, POC.fireRange);
    if (target && this.fireCooldownMs <= 0) {
      const dx = target.x - player.x, dy = target.y - player.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const interval = POC.shotIntervalMs / (player.deployed ? POC.deployRateMultiplier : 1);
      this.fireCooldownMs = interval;
      state.bullets.push({
        x: player.x, y: player.y,
        vx: dx / distance * POC.bulletSpeed,
        vy: dy / distance * POC.bulletSpeed,
        remainingMs: 800,
      });
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * seconds; bullet.y += bullet.vy * seconds;
      bullet.remainingMs -= ms;
      let removed = bullet.remainingMs <= 0;
      if (!removed) for (const enemy of state.enemies) {
        if (squaredDistance(bullet, enemy) > 18 * 18) continue;
        enemy.hp -= 28 * (player.deployed ? POC.deployDamageMultiplier : 1);
        removed = true;
        break;
      }
      if (removed) state.bullets.splice(i, 1);
    }
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      if (state.enemies[i].hp > 0) continue;
      state.enemies.splice(i, 1);
      state.kills++;
    }
  }
}
