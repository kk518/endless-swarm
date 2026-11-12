/**
 * 《无尽虫潮》migration vertical slice: deterministic, engine-independent combat.
 * This source is imported by BOTH the Cocos Creator component and the browser
 * preview. It does NOT yet implement full M6 campaign/hero/meta progression.
 * No imports from cc, Phaser, DOM or wx are allowed.
 */
export interface Vec2 { x: number; y: number }
export type PocEnemyKind = 'grunt' | 'leaper' | 'armored' | 'boss';
export interface PocPlayer extends Vec2 {
  hp: number;
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
  fromX: number; fromY: number; toX: number; toY: number; remainingMs: number;
}
export interface PocState {
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
  return 6 + 3 * Math.max(1, Math.floor(level));
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
    player: { x: 0, y: 0, hp: 6, stationaryMs: 0, deployed: false },
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
  readonly state: PocState;
  private accumulatorMs = 0;
  private fireCooldownMs = 0;
  private arcCooldownMs = 0;
  private spawnCooldownMs = POC.enemySpawnMs;
  private hurtCooldownMs = 0;
  private nextId = 1;
  private randomState: number;
  private readonly initialSeed: number;

  constructor(width = 450, height = 800, seed = 12345) {
    this.width = width;
    this.height = height;
    this.initialSeed = seed >>> 0;
    this.randomState = this.initialSeed;
    this.state = emptyState();
    this.spawnEnemyAt(130, 60);
  }
  reset(): void {
    Object.assign(this.state, emptyState());
    this.accumulatorMs = 0;
    this.fireCooldownMs = 0;
    this.arcCooldownMs = 0;
    this.spawnCooldownMs = POC.enemySpawnMs;
    this.hurtCooldownMs = 0;
    this.nextId = 1;
    this.randomState = this.initialSeed;
    this.spawnEnemyAt(130, 60);
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
  private addXp(amount: number): void {
    const s = this.state;
    s.xp += amount;
    while (s.level < POC.maxLevel && s.xp >= s.xpToNext) {
      s.xp -= s.xpToNext;
      s.level++;
      s.xpToNext = xpRequired(s.level);
      if (s.level >= 3) s.arcUnlocked = true; // independent auto-fire lightning coil
    }
    if (s.level >= POC.maxLevel) s.xp = Math.min(s.xp, s.xpToNext);
  }
  private spawnWaveEnemy(player: PocPlayer): void {
    const wave = this.state.wave;
    const roll = this.nextRandom();
    const kind: PocEnemyKind =
      wave >= 4 && roll < .22 ? 'armored'
      : wave >= 2 && roll < .50 ? 'leaper'
      : 'grunt';
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
      state.kills++;
      this.addXp(enemyStats(e.kind ?? 'grunt').xp);
      if (e.kind === 'boss') { state.won = true; state.over = true; }
    }
  }
  private step(ms: number, move: Vec2): void {
    const state = this.state, player = state.player;
    state.elapsedMs += ms;
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

    const nextWave = Math.min(5, 1 + Math.floor(state.elapsedMs / POC.waveDurationMs));
    if (nextWave > state.wave) state.wave = nextWave;
    if (state.wave === 5 && !state.bossSpawned) {
      state.bossSpawned = true;
      this.spawnEnemyAt(clamp(player.x + 135, -this.width/2+30, this.width/2-30),
        clamp(player.y + 160, -this.height/2+30, this.height/2-30), 'boss');
    }
    this.spawnCooldownMs -= ms;
    if (this.spawnCooldownMs <= 0) {
      this.spawnCooldownMs += Math.max(370, POC.enemySpawnMs - (state.wave - 1) * 270);
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
      const rateBonus = 1 + (state.level - 1) * .025;
      const interval = POC.shotIntervalMs / (rateBonus * (player.deployed ? POC.deployRateMultiplier : 1));
      this.fireCooldownMs = interval;
      state.bullets.push({
        x: player.x, y: player.y,
        vx: dx / distance * POC.bulletSpeed, vy: dy / distance * POC.bulletSpeed,
        remainingMs: 800,
      });
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * seconds;
      bullet.y += bullet.vy * seconds;
      bullet.remainingMs -= ms;
      let removed = bullet.remainingMs <= 0;
      if (!removed) for (const e of state.enemies) {
        if (e.hp <= 0 || squaredDistance(bullet, e) > 18 * 18) continue;
        e.hp -= (28 + 3 * (state.level - 1)) *
          (player.deployed ? POC.deployDamageMultiplier : 1);
        removed = true;
        break;
      }
      if (removed) state.bullets.splice(i, 1);
    }

    if (state.arcUnlocked) {
      this.arcCooldownMs -= ms;
      if (this.arcCooldownMs <= 0) {
        const first = nearestEnemy(player, state.enemies, 250);
        if (first) {
          const victims = state.enemies.filter(e => e.hp > 0 && e.id !== first.id
            && squaredDistance(first, e) < 125 * 125)
            .sort((a,b) => squaredDistance(first,a) - squaredDistance(first,b));
          const chain = [first, ...victims.slice(0, state.level >= 6 ? 2 : 1)];
          let from: Vec2 = player;
          for (const e of chain) {
            state.lightning.push({
              fromX: from.x, fromY: from.y, toX: e.x, toY: e.y, remainingMs: 160,
            });
            e.hp -= 19 + (state.level - 1) * 2;
            from = e;
          }
          this.arcCooldownMs = 940 / (player.deployed ? POC.deployRateMultiplier : 1);
        }
      }
    }
    this.resolveDeaths();
  }
}
