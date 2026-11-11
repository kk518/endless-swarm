import Phaser from 'phaser';
import { createArt } from './Art';
import { SoundFx } from './Sound';
import {
  GAMEPLAY, fireIntervalMs, formatTime,
  FIXED_STEP_MS, fixedStepBatch, isDeployed, normalizedMove, selectTarget, spawnIntervalMs,
} from './combat';
import {
  applyCard, newBuild, nextPhase, pickEnemyKind, rollCards, WAVES,
  type CardDef, type CardId, type EnemyKind, type RunBuild, type WeaponId,
} from './progression';

const VIEW_W = 450;
const WORLD = 2300;
const CENTER = WORLD / 2;
const JOYSTICK_RANGE = 57;

type Enemy = {
  kind: EnemyKind;
  x: number;
  y: number;
  alive: boolean;
  hp: number;
  speed: number;
  size: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Arc;
  flashTime: number;
  slowMs: number;
  attackCooldownMs: number;
  windupMs: number;
  warning: Phaser.GameObjects.Arc | null;
};

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  remainingMs: number;
  pierce: number;
  hitEnemies: Set<Enemy>;
  frost: boolean;
  sprite: Phaser.GameObjects.Image;
};

type Acid = { x: number; y: number; vx: number; vy: number; remainingMs: number; sprite: Phaser.GameObjects.Image };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxMs: number;
  sprite: Phaser.GameObjects.Arc;
};

export interface RunResult {
  kills: number; survived: string; record: number;
  victory: boolean; wave: number; weapons: WeaponId[]; cards: string[];
}
export interface RewardOffer { wave: number; options: CardDef[]; nextWave: number }

/** An immediately playable mobile vertical slice of Endless Swarm. */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private rifle!: Phaser.GameObjects.Image;
  private aura!: Phaser.GameObjects.Arc;
  private targetingLine!: Phaser.GameObjects.Graphics;
  private enemyList: Enemy[] = [];
  private bullets: Bullet[] = [];
  private acids: Acid[] = [];
  private particles: Particle[] = [];
  private lockedTarget: Enemy | null = null;
  private soundFx = new SoundFx();
  private active = false;
  private awaitingReward = false;
  private rewardOptions: CardDef[] = [];
  private waveNumber = 1;
  private waveElapsedMs = 0;
  private bossSpawned = false;
  private bossKilled = false;
  private build: RunBuild = newBuild();
  private weaponCooldowns: Record<WeaponId, number> = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
  private lastDeployedMs = -10000;
  private overloadMs = 0;
  private ready = false;
  private timeMs = 0;
  private simAccumulatorMs = 0;
  private spawnAccumulator = 0;
  private stillMs = 0;
  private deployed = false;
  private hp = GAMEPLAY.playerMaxHealth;
  private lastHurtMs = -10000;
  private kills = 0;
  private joystickPointer: number | null = null;
  private joystickOrigin = { x: 90, y: 685 };
  private joystickValue = { x: 0, y: 0 };
  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickKnob!: Phaser.GameObjects.Arc;
  private keyboardWASD?: Record<string, Phaser.Input.Keyboard.Key>;
  private keyboardArrows?: Phaser.Types.Input.Keyboard.CursorKeys;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Arc;
  private clockLabel!: Phaser.GameObjects.Text;
  private killLabel!: Phaser.GameObjects.Text;
  private stateLabel!: Phaser.GameObjects.Text;
  private waveLabel!: Phaser.GameObjects.Text;
  private modeHint!: Phaser.GameObjects.Text;
  private introHint!: Phaser.GameObjects.Text;
  private introFadeMs = 0;

  constructor() { super({ key: 'Battle' }); }

  create(): void {
    createArt(this);
    this.cameras.main.setBackgroundColor('#08121c');
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);

    this.add.tileSprite(CENTER, CENTER, WORLD, WORLD, 'dust').setDepth(-50);
    this.drawWorldDecorations();

    this.aura = this.add.circle(CENTER, CENTER, 37, 0x49f5cb, 0.075)
      .setStrokeStyle(2, 0x60ffdc, 0.2).setDepth(1);
    this.player = this.add.image(CENTER, CENTER, 'marine').setDepth(7);
    this.rifle = this.add.image(CENTER + 22, CENTER + 4, 'rifle')
      .setOrigin(0.28, 0.5).setDepth(8);
    this.targetingLine = this.add.graphics().setDepth(3);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);

    this.buildHUD();
    this.buildJoystick();
    this.keyboardWASD = this.input.keyboard?.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    this.keyboardArrows = this.input.keyboard?.createCursorKeys();
    this.input.keyboard?.addCapture('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('gameout', this.releaseJoystick, this);
    // Browsers can revoke touches without a pointerup (app switch, call, etc.).
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseControls, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutHUD, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseControls, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutHUD, this);
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.input.off('pointerupoutside', this.onPointerUp, this);
      this.input.off('gameout', this.releaseJoystick, this);
    });

    this.ready = true;
    this.updateHUD();
  }

  /** Called by the HTML start/retry button; safe for repeated sessions. */
  startRun(): void {
    if (!this.ready) return;
    this.removeProjectilesAndEnemies();
    this.player.setPosition(CENTER, CENTER).setTint(0xffffff);
    this.rifle.setPosition(CENTER + 22, CENTER + 4).setRotation(0);
    this.aura.setPosition(CENTER, CENTER).setAlpha(1);
    this.cameras.main.centerOn(CENTER, CENTER);
    this.timeMs = 0;
    this.simAccumulatorMs = 0;
    this.spawnAccumulator = 500;
    this.weaponCooldowns = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
    this.waveNumber = 1;
    this.waveElapsedMs = 0;
    this.bossSpawned = false;
    this.bossKilled = false;
    this.awaitingReward = false;
    this.rewardOptions = [];
    this.build = newBuild();
    this.lastDeployedMs = -10000;
    this.overloadMs = 0;
    this.stillMs = 0;
    this.deployed = false;
    this.lastHurtMs = -10000;
    this.kills = 0;
    this.hp = this.build.hp;
    this.lockedTarget = null;
    this.introFadeMs = 4600;
    this.introHint.setText('拖动屏幕移动  ·  松手展开火力').setAlpha(1);
    this.stateLabel.setText('机动射击');
    this.releaseJoystick();
    this.soundFx.unlock();
    this.active = true;
    this.updateHUD();
  }

  /** The DOM reward UI is the only allowed path to resume a completed wave. */
  chooseCard(cardId: string): boolean {
    if (!this.awaitingReward || !this.rewardOptions.some(card => card.id === cardId)) return false;
    this.build.hp = this.hp;
    if (!applyCard(this.build, cardId as CardId)) return false;
    this.hp = Math.min(this.build.maxHp, this.build.hp + 1); // field repair between waves
    this.build.hp = this.hp;
    this.waveNumber++;
    this.waveElapsedMs = 0;
    this.spawnAccumulator = 800;
    this.weaponCooldowns = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
    this.bossSpawned = false;
    this.bossKilled = false;
    this.awaitingReward = false;
    this.rewardOptions = [];
    this.simAccumulatorMs = 0;
    this.releaseJoystick();
    this.introFadeMs = 2200;
    this.introHint.setText(`第 ${this.waveNumber} 波虫潮来袭`).setAlpha(1);
    this.active = true;
    this.updateHUD();
    return true;
  }

  setMuted(muted: boolean): void { this.soundFx.setMuted(muted); }

  /** Interruptions must not leave a finger logically held down or cause a catch-up burst. */
  pauseControls(): void {
    this.releaseJoystick();
    this.simAccumulatorMs = 0;
  }

  private layoutHUD(): void {
    if (!this.ready) return;
    this.stateLabel.setY(this.scale.height - 123);
    this.modeHint.setY(this.scale.height - 99);
    this.introHint.setY(this.scale.height - 195);
    this.releaseJoystick();
    this.updateHUD();
  }

  private drawWorldDecorations(): void {
    const g = this.add.graphics().setDepth(-40);
    // Concentric facility rings signal position without adding collisions.
    g.lineStyle(4, 0x3d6366, 0.20);
    g.strokeCircle(CENTER, CENTER, 450);
    g.strokeCircle(CENTER, CENTER, 720);
    g.lineStyle(2, 0x58aaa9, 0.21);
    g.strokeCircle(CENTER, CENTER, 590);
    g.lineStyle(1, 0x3c777d, 0.20);
    for (let i = 0; i < 36; i++) {
      const t = (i * Math.PI * 2) / 36;
      const x = CENTER + Math.cos(t) * 585;
      const y = CENTER + Math.sin(t) * 585;
      g.lineBetween(x, y, x + Math.cos(t) * 20, y + Math.sin(t) * 20);
    }
    for (let i = 0; i < 32; i++) {
      const x = (i * 379 + 167) % WORLD;
      const y = (i * 521 + 357) % WORLD;
      if (Math.hypot(x - CENTER, y - CENTER) < 220) continue;
      g.fillStyle(i % 3 === 0 ? 0x3f8790 : 0x365264, 0.20);
      g.fillRoundedRect(x, y, 28 + (i % 3) * 17, 8, 3);
      g.fillStyle(0x69a3a4, 0.20); g.fillCircle(x + 4, y + 4, 2);
    }
  }

  private hudText(x: number, y: number, value: string, size: string, color: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, {
      fontFamily: 'Trebuchet MS, Arial, sans-serif',
      fontSize: size, color, fontStyle: 'bold',
      stroke: '#07171e', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(110);
  }

  private buildHUD(): void {
    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudText(30, 24, '装甲完整度', '14px', '#a5c1c8');
    this.clockLabel = this.hudText(VIEW_W - 27, 21, '00:00', '26px', '#f3faf5').setOrigin(1, 0);
    this.killLabel = this.hudText(VIEW_W - 28, 55, '击杀 000', '14px', '#92d8c2').setOrigin(1, 0);
    this.waveLabel = this.hudText(VIEW_W / 2, 90, '第 1 / 5 波', '16px', '#ffcd91').setOrigin(0.5, 0);
    this.stateLabel = this.hudText(VIEW_W / 2, this.scale.height - 123, '机动射击', '18px', '#c1f7e7').setOrigin(0.5, 0.5);
    this.modeHint = this.hudText(VIEW_W / 2, this.scale.height - 99, '移动射击中', '12px', '#79a2a9').setOrigin(0.5, 0.5);
    this.introHint = this.hudText(VIEW_W / 2, this.scale.height - 195, '', '16px', '#fcdb9b').setOrigin(0.5, 0.5);
    this.crosshair = this.add.circle(0, 0, 13, 0x79ffe9, 0).setStrokeStyle(1.4, 0x70ffe2, 0.6)
      .setDepth(5).setVisible(false);
  }

  private buildJoystick(): void {
    this.joystickBase = this.add.circle(90, 680, JOYSTICK_RANGE, 0xa0dcd1, 0.07)
      .setStrokeStyle(2, 0x8bf9db, 0.42).setScrollFactor(0).setDepth(120).setVisible(false);
    this.joystickKnob = this.add.circle(90, 680, 24, 0x92ffde, 0.36)
      .setStrokeStyle(2, 0xdefdef, 0.9).setScrollFactor(0).setDepth(121).setVisible(false);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.active || this.joystickPointer !== null) return;
    // Reserve the upper HUD/battle-visibility area; either thumb can play in the lower area.
    if (pointer.y < this.scale.height * 0.42) return;
    this.joystickPointer = pointer.id;
    this.joystickOrigin = { x: pointer.x, y: pointer.y };
    this.joystickBase.setPosition(pointer.x, pointer.y).setVisible(true);
    this.joystickKnob.setPosition(pointer.x, pointer.y).setVisible(true);
    this.updateJoystick(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointer) this.updateJoystick(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointer) this.releaseJoystick();
  }

  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.joystickOrigin.x;
    const dy = pointer.y - this.joystickOrigin.y;
    const dist = Math.hypot(dx, dy);
    const limited = Math.min(JOYSTICK_RANGE, dist);
    const angle = Math.atan2(dy, dx);
    const lx = Math.cos(angle) * limited;
    const ly = Math.sin(angle) * limited;
    this.joystickKnob.setPosition(this.joystickOrigin.x + lx, this.joystickOrigin.y + ly);
    const deadzone = 8;
    const strength = dist > deadzone ? Math.min(1, (dist - deadzone) / (JOYSTICK_RANGE - deadzone)) : 0;
    this.joystickValue = { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
  }

  private releaseJoystick(): void {
    this.joystickPointer = null;
    this.joystickValue = { x: 0, y: 0 };
    this.joystickBase?.setVisible(false);
    this.joystickKnob?.setVisible(false);
  }

  private movement(): { x: number; y: number } {
    let { x, y } = this.joystickValue;
    const keys = this.keyboardWASD;
    const arrows = this.keyboardArrows;
    if (keys || arrows) {
      if (keys?.A?.isDown || arrows?.left.isDown) x -= 1;
      if (keys?.D?.isDown || arrows?.right.isDown) x += 1;
      if (keys?.W?.isDown || arrows?.up.isDown) y -= 1;
      if (keys?.S?.isDown || arrows?.down.isDown) y += 1;
    }
    return normalizedMove(x, y);
  }

  update(_time: number, delta: number): void {
    if (!this.active) return;
    const batch = fixedStepBatch(this.simAccumulatorMs, delta);
    this.simAccumulatorMs = batch.remainderMs;
    for (let i = 0; i < batch.steps && this.active; i++) this.simulate(FIXED_STEP_MS);
  }

  private simulate(ms: number): void {
    const dt = ms / 1000;
    this.timeMs += ms;
    this.waveElapsedMs += ms;
    this.introFadeMs -= ms;
    if (this.introFadeMs < 1200) this.introHint.setAlpha(Phaser.Math.Clamp(this.introFadeMs / 1200, 0, 1));

    const move = this.movement();
    const moving = Math.hypot(move.x, move.y) > 0.07;
    if (moving) {
      this.player.x = Phaser.Math.Clamp(this.player.x + move.x * GAMEPLAY.moveSpeed * this.build.speed * dt, 60, WORLD - 60);
      this.player.y = Phaser.Math.Clamp(this.player.y + move.y * GAMEPLAY.moveSpeed * this.build.speed * dt, 60, WORLD - 60);
      this.stillMs = 0;
    } else {
      this.stillMs += ms;
    }
    const nextDeploy = isDeployed(this.stillMs / this.build.deployDelay, moving);
    if (nextDeploy && !this.deployed) {
      this.deployBurst();
      this.soundFx.deploy();
    }
    if (this.deployed && !nextDeploy) this.lastDeployedMs = this.timeMs;
    this.deployed = nextDeploy;
    this.overloadMs = this.deployed ? this.overloadMs + ms : 0;
    this.aura.setPosition(this.player.x, this.player.y).setRadius(this.deployed ? 47 : 36)
      .setFillStyle(this.deployed ? 0xffb96f : 0x6cfadc, this.deployed ? 0.13 : 0.07)
      .setStrokeStyle(2, this.deployed ? 0xffcd83 : 0x58dcc6, this.deployed ? 0.84 : 0.2);
    this.player.setTint(this.timeMs - this.lastHurtMs < 170 ? 0xff6a5b : this.deployed ? 0xffe6ba : 0xffffff);

    this.updateEnemies(dt, ms);
    if (!this.active) return; // Contact damage can end a run before the rest of this step.
    this.lockedTarget = selectTarget(this.player, this.enemyList, GAMEPLAY.fireRange, this.lockedTarget);
    this.crosshair.setVisible(Boolean(this.lockedTarget));
    this.targetingLine.clear();
    if (this.lockedTarget) {
      const target = this.lockedTarget;
      const aim = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      this.rifle.setRotation(aim);
      this.rifle.setPosition(this.player.x + Math.cos(aim) * 15, this.player.y + Math.sin(aim) * 15);
      this.crosshair.setPosition(target.x, target.y);
    } else {
      this.rifle.setPosition(this.player.x + 15, this.player.y + 4);
    }
    this.updateWeapons(ms);
    this.updateBullets(dt, ms);
    if (!this.active) return;
    this.updateAcids(dt, ms);
    if (!this.active) return;
    this.updateParticles(dt, ms);
    this.spawnAccumulator += ms;
    const wave = WAVES[this.waveNumber - 1];
    const spawnEvery = this.waveNumber === 1 ? Math.min(spawnIntervalMs(this.timeMs / 1000), wave.spawnIntervalMs) : wave.spawnIntervalMs;
    if (this.spawnAccumulator >= spawnEvery) {
      this.spawnAccumulator = 0;
      if (this.enemyList.length < wave.maxEnemies) this.spawnEnemy(pickEnemyKind(wave));
    }
    if (this.waveNumber === 5 && !this.bossSpawned && this.waveElapsedMs > 2500) {
      this.bossSpawned = this.spawnEnemy('boss');
      if (this.bossSpawned) {
        this.introHint.setText('警告：虫巢巨兽接近！').setAlpha(1);
        this.introFadeMs = 2800;
      }
    }
    const phase = nextPhase(this.waveNumber, this.bossKilled, this.waveElapsedMs);
    if (phase === 'reward') this.endWave();
    if (phase === 'victory') this.finishRun(true);
    if (phase === 'timeout') this.finishRun(false);
    this.updateHUD();
  }

  private endWave(): void {
    this.active = false;
    this.awaitingReward = true;
    this.releaseJoystick();
    this.removeProjectilesAndEnemies();
    this.lockedTarget = null;
    this.rewardOptions = rollCards(this.build, this.waveNumber);
    const detail: RewardOffer = {
      wave: this.waveNumber, nextWave: this.waveNumber + 1, options: this.rewardOptions,
    };
    window.dispatchEvent(new CustomEvent<RewardOffer>('swarm:reward', { detail }));
  }

  private spawnEnemy(kind: EnemyKind): boolean {
    const angle = Math.random() * Math.PI * 2;
    const radius = kind === 'boss' ? 315 : 430 + Math.random() * 140;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, 40, WORLD - 40);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, 40, WORLD - 40);
    if (Math.hypot(x - this.player.x, y - this.player.y) < 260) return false;
    const def: Record<EnemyKind, { hp: number; speed: number; size: number; color: number }> = {
      grunt: { hp: 42, speed: 62, size: 0.92, color: 0xffffff },
      leaper: { hp: 45, speed: 105, size: 0.84, color: 0xf2a867 },
      armored: { hp: 132, speed: 41, size: 1.38, color: 0xa0b8e0 },
      spitter: { hp: 65, speed: 47, size: 1.05, color: 0xb3ee83 },
      boss: { hp: 1500, speed: 46, size: 3.0, color: 0xe99578 },
    };
    const stats = def[kind];
    const shadow = this.add.circle(x, y + 13, 17 * stats.size, 0x020e12, 0.35).setScale(1, 0.4).setDepth(0);
    const sprite = this.add.image(x, y, kind === 'boss' ? 'broodlord' : 'crawler')
      .setScale(stats.size).setDepth(kind === 'boss' ? 6 : 5);
    if (stats.color !== 0xffffff) sprite.setTint(stats.color);
    const warning = kind === 'leaper' || kind === 'spitter' || kind === 'boss'
      ? this.add.circle(x, y, kind === 'boss' ? 65 : 26, 0xff745c, 0.13)
        .setStrokeStyle(2, 0xffa271, 0.7).setDepth(2).setVisible(false)
      : null;
    this.enemyList.push({
      kind, x, y, alive: true, hp: stats.hp, speed: stats.speed, size: stats.size,
      sprite, shadow, warning, flashTime: 0, slowMs: 0, attackCooldownMs: 1900 + Math.random() * 1500, windupMs: 0,
    });
    return true;
  }

  private updateEnemies(dt: number, ms: number): void {
    for (const enemy of this.enemyList) {
      if (!enemy.alive) continue;
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.max(0.1, Math.hypot(dx, dy));
      enemy.slowMs = Math.max(0, enemy.slowMs - ms);
      enemy.attackCooldownMs -= ms;
      const special = enemy.kind === 'leaper' || enemy.kind === 'spitter' || enemy.kind === 'boss';
      if (special && enemy.attackCooldownMs <= 0 && enemy.windupMs <= 0) {
        enemy.windupMs = enemy.kind === 'boss' ? 900 : enemy.kind === 'spitter' ? 700 : 530;
        enemy.warning?.setVisible(true);
      }
      if (enemy.windupMs > 0) {
        enemy.windupMs -= ms;
        enemy.warning?.setPosition(enemy.x, enemy.y);
        if (enemy.windupMs <= 0) {
          enemy.warning?.setVisible(false);
          if (enemy.kind === 'spitter') this.spitAcid(enemy);
          if (enemy.kind === 'leaper' || enemy.kind === 'boss') {
            const leap = enemy.kind === 'boss' ? 125 : 102;
            enemy.x = Phaser.Math.Clamp(enemy.x + dx / distance * leap, 48, WORLD - 48);
            enemy.y = Phaser.Math.Clamp(enemy.y + dy / distance * leap, 48, WORLD - 48);
            this.spawnSparks(enemy.x, enemy.y, enemy.kind === 'boss' ? 14 : 6, 0xff916b, 145);
          }
          enemy.attackCooldownMs = enemy.kind === 'boss' ? 2700 : enemy.kind === 'spitter' ? 3100 : 3600;
        }
      } else {
        // Ranged spitters keep some distance; leapers telegraph before lunging.
        const preferred = enemy.kind === 'spitter' ? 270 : 19;
        const direction = distance > preferred ? 1 : enemy.kind === 'spitter' && distance < 180 ? -0.75 : 0.2;
        const slowed = enemy.slowMs > 0 ? 0.7 : 1;
        enemy.x = Phaser.Math.Clamp(enemy.x + dx / distance * enemy.speed * slowed * direction * dt, 48, WORLD - 48);
        enemy.y = Phaser.Math.Clamp(enemy.y + dy / distance * enemy.speed * slowed * direction * dt, 48, WORLD - 48);
      }
      enemy.sprite.setPosition(enemy.x, enemy.y);
      enemy.shadow.setPosition(enemy.x, enemy.y + 14 * enemy.size);
      enemy.sprite.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      if (enemy.flashTime > 0) {
        enemy.flashTime -= ms;
        if (enemy.flashTime <= 0) {
          const tint = enemy.kind === 'grunt' ? 0xffffff : enemy.kind === 'leaper' ? 0xf2a867 : enemy.kind === 'armored' ? 0xa0b8e0 : enemy.kind === 'spitter' ? 0xb3ee83 : 0xe99578;
          enemy.sprite.setTint(tint);
        }
      }
      if (distance < 19 + enemy.size * 14 && this.timeMs - this.lastHurtMs > GAMEPLAY.hitGraceMs) {
        this.hurt(enemy.kind === 'boss' ? 2 : 1);
        if (!this.active) return;
      }
    }
  }

  private weaponDamage(base: number): number {
    const mobileAfterglow = this.build.afterglow && !this.deployed && this.timeMs - this.lastDeployedMs < 1200;
    return base * this.build.damage * (this.deployed ? GAMEPLAY.deployDamageMultiplier : mobileAfterglow ? 1.15 : 1);
  }

  private weaponInterval(base: number): number {
    const overdriveBonus = this.deployed && this.build.overload && this.overloadMs < 3000 ? 1.4 : 1;
    return base / (this.build.rate * (this.deployed ? GAMEPLAY.deployRateMultiplier : 1) * overdriveBonus);
  }

  private updateWeapons(ms: number): void {
    for (const id of this.build.weapons) {
      this.weaponCooldowns[id] = Math.max(0, this.weaponCooldowns[id] - ms);
      const range = (id === 'flame' ? 190 : id === 'scatter' ? 270 : id === 'arc' ? 320 : GAMEPLAY.fireRange) * this.build.range;
      const target = selectTarget(this.player, this.enemyList, range);
      if (!target || this.weaponCooldowns[id] > 0) continue;
      const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      switch (id) {
        case 'rifle': this.fire(angle, this.weaponDamage(GAMEPLAY.bulletDamage), this.build.pierce, 1, 0x64f6e5); break;
        case 'scatter': this.fireScatter(angle); break;
        case 'arc': this.fireArc(target); break;
        case 'flame': this.fireFlame(angle); break;
      }
      const interval = id === 'rifle' ? fireIntervalMs(false) : id === 'scatter' ? 850 : id === 'arc' ? 980 : 170;
      this.weaponCooldowns[id] = this.weaponInterval(interval);
    }
  }

  private fire(angle: number, damage: number, pierce: number, scale = 1, tint = 0x64f6e5): void {
    const muzzleX = this.player.x + Math.cos(angle) * 40;
    const muzzleY = this.player.y + Math.sin(angle) * 40;
    const bullet = this.add.image(muzzleX, muzzleY, 'bolt').setRotation(angle).setDepth(9).setScale(scale).setTint(tint);
    if (this.deployed) bullet.setScale(scale * 1.12);
    this.bullets.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(angle) * GAMEPLAY.projectileSpeed,
      vy: Math.sin(angle) * GAMEPLAY.projectileSpeed,
      damage, pierce, hitEnemies: new Set<Enemy>(), frost: this.build.frost,
      remainingMs: GAMEPLAY.projectileLifetimeMs, sprite: bullet,
    });
    this.spawnSparks(muzzleX, muzzleY, 2, tint, 80);
    this.soundFx.shot();
  }

  private fireScatter(angle: number): void {
    for (let i = -2; i <= 2; i++) {
      const spread = i * 0.14 * this.build.range;
      this.fire(angle + spread, this.weaponDamage(19), this.build.pierce, 0.8, 0xffc88c);
    }
  }

  private fireArc(first: Enemy): void {
    const chained = new Set<Enemy>();
    let current: Enemy | null = first;
    for (let i = 0; i < 4 && current; i++) {
      const enemy: Enemy = current;
      chained.add(enemy);
      this.damageEnemy(enemy, this.weaponDamage(i === 0 ? 38 : 25));
      if (this.build.frost) enemy.slowMs = 1000;
      this.spawnSparks(enemy.x, enemy.y, 6, 0x8aaeff, 130);
      const nearby: Enemy[] = this.enemyList.filter(e => e.alive && !chained.has(e) && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 160 * this.build.range);
      current = nearby.sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0] ?? null;
    }
    this.soundFx.shot();
  }

  private fireFlame(angle: number): void {
    const range = 190 * this.build.range;
    const cosThreshold = Math.cos(0.45 * this.build.range);
    let hits = 0;
    for (const enemy of [...this.enemyList]) {
      if (!enemy.alive) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const len = Math.hypot(dx, dy);
      if (len > range || len <= 0 || (dx * Math.cos(angle) + dy * Math.sin(angle)) / len < cosThreshold) continue;
      this.damageEnemy(enemy, this.weaponDamage(9));
      if (this.build.frost) enemy.slowMs = 1000;
      hits++;
    }
    const x = this.player.x + Math.cos(angle) * 85;
    const y = this.player.y + Math.sin(angle) * 85;
    this.spawnSparks(x, y, Math.min(8, hits + 3), 0xff9f4f, 240);
    this.soundFx.shot();
  }

  private spitAcid(enemy: Enemy): void {
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    const projectile = this.add.image(enemy.x, enemy.y, 'acid').setRotation(angle).setDepth(8);
    this.acids.push({
      x: enemy.x, y: enemy.y,
      vx: Math.cos(angle) * 230, vy: Math.sin(angle) * 230,
      remainingMs: 2200, sprite: projectile,
    });
  }

  private updateAcids(dt: number, ms: number): void {
    for (let i = this.acids.length - 1; i >= 0; i--) {
      const acid = this.acids[i];
      acid.x += acid.vx * dt;
      acid.y += acid.vy * dt;
      acid.remainingMs -= ms;
      acid.sprite.setPosition(acid.x, acid.y);
      const hit = Math.hypot(acid.x - this.player.x, acid.y - this.player.y) < 24;
      if (hit && this.timeMs - this.lastHurtMs > GAMEPLAY.hitGraceMs) this.hurt();
      if (hit || acid.remainingMs <= 0) {
        acid.sprite.destroy();
        this.acids.splice(i, 1);
      }
      if (!this.active) return;
    }
  }

  private updateBullets(dt: number, ms: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      const oldX = bullet.x;
      const oldY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.remainingMs -= ms;
      bullet.sprite.setPosition(bullet.x, bullet.y);
      for (const enemy of [...this.enemyList]) {
        if (!enemy.alive || bullet.hitEnemies.has(enemy)) continue;
        const vx = bullet.x - oldX;
        const vy = bullet.y - oldY;
        const len2 = vx * vx + vy * vy;
        const t = len2 > 0 ? Phaser.Math.Clamp(((enemy.x - oldX) * vx + (enemy.y - oldY) * vy) / len2, 0, 1) : 0;
        const cx = oldX + vx * t;
        const cy = oldY + vy * t;
        if (Math.hypot(enemy.x - cx, enemy.y - cy) < 16 * enemy.size + 3) {
          bullet.hitEnemies.add(enemy);
          this.damageEnemy(enemy, bullet.damage);
          if (bullet.frost) enemy.slowMs = 1000;
          this.spawnSparks(bullet.x, bullet.y, 3, 0xa5ffd3, 110);
          if (bullet.hitEnemies.size > bullet.pierce) break;
        }
      }
      if (bullet.hitEnemies.size > bullet.pierce || bullet.remainingMs <= 0) {
        bullet.sprite.destroy();
        this.bullets.splice(i, 1);
      }
      if (!this.active) return;
    }
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    if (!enemy.alive) return;
    enemy.hp -= damage;
    if (enemy.hp > 0) {
      enemy.flashTime = 78;
      enemy.sprite.setTint(0xf5fff6);
      return;
    }
    enemy.alive = false;
    enemy.sprite.destroy();
    enemy.shadow.destroy();
    enemy.warning?.destroy();
    this.spawnSparks(enemy.x, enemy.y, enemy.kind === 'boss' ? 35 : 7, 0x9ce281, 190);
    this.kills++;
    if (this.kills % 3 === 0) this.soundFx.kill();
    if (this.lockedTarget === enemy) this.lockedTarget = null;
    const index = this.enemyList.indexOf(enemy);
    if (index >= 0) this.enemyList.splice(index, 1);
    if (enemy.kind === 'boss') this.bossKilled = true;
    if (this.build.explosionChance > 0 && Math.random() < this.build.explosionChance) {
      // One-depth explosion (no recursive chain reaction): bounded damage and frame cost.
      for (const other of [...this.enemyList]) {
        if (!other.alive || Math.hypot(enemy.x - other.x, enemy.y - other.y) > 100 * this.build.range) continue;
        other.hp -= this.weaponDamage(35);
        other.flashTime = 85;
        other.sprite.setTint(0xffd19b);
        if (other.hp <= 0) {
          // Explosive kills cannot trigger additional explosions.
          other.alive = false;
          other.sprite.destroy(); other.shadow.destroy(); other.warning?.destroy();
          this.enemyList.splice(this.enemyList.indexOf(other), 1);
          if (other.kind === 'boss') this.bossKilled = true;
          this.kills++;
          this.spawnSparks(other.x, other.y, 5, 0xffbb6b, 180);
        }
      }
      this.spawnSparks(enemy.x, enemy.y, 13, 0xffad62, 220);
    }
  }

  private spawnSparks(x: number, y: number, count: number, color: number, speed: number): void {
    // A bounded particle budget keeps phones responsive during bursts of kills.
    for (let i = 0; i < count && this.particles.length < 105; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.5 + Math.random() * 0.65);
      const lifeMs = 120 + Math.random() * 210;
      const sprite = this.add.circle(x, y, 1.7 + Math.random() * 2, color, 0.92).setDepth(11);
      this.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, lifeMs, maxMs: lifeMs, sprite });
    }
  }

  private updateParticles(dt: number, ms: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifeMs -= ms;
      if (p.lifeMs <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
      } else {
        p.sprite.setPosition(p.x, p.y).setAlpha(p.lifeMs / p.maxMs);
      }
    }
  }

  private deployBurst(): void {
    this.spawnSparks(this.player.x, this.player.y, 12, 0xffc987, 155);
    this.cameras.main.shake(75, 0.0015);
  }

  private hurt(amount = 1): void {
    this.lastHurtMs = this.timeMs;
    if (this.deployed && this.build.bulwark && Math.random() < 0.4) {
      this.spawnSparks(this.player.x, this.player.y, 7, 0x9cdaff, 130);
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.build.hp = this.hp;
    this.cameras.main.shake(150, 0.006);
    this.player.setTint(0xff6a5b);
    this.soundFx.hurt();
    // Red damage flash is derived from game time; no stale timer can tint a restarted run.
    if (this.hp <= 0) this.finishRun(false);
  }

  private finishRun(victory: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.releaseJoystick();
    this.crosshair.setVisible(false);
    this.targetingLine.clear();
    let previous = 0;
    try { previous = Number(localStorage.getItem('endless-swarm-best-kills')) || 0; } catch { /* private browsing */ }
    const record = Math.max(previous, this.kills);
    try { localStorage.setItem('endless-swarm-best-kills', String(record)); } catch { /* optional */ }
    const result: RunResult = {
      kills: this.kills, survived: formatTime(this.timeMs / 1000), record,
      victory, wave: this.waveNumber, weapons: [...this.build.weapons],
      cards: [...this.build.selected],
    };
    window.dispatchEvent(new CustomEvent<RunResult>('swarm:gameover', { detail: result }));
  }

  private updateHUD(): void {
    this.clockLabel.setText(formatTime(this.timeMs / 1000));
    this.killLabel.setText(`击杀 ${String(this.kills).padStart(3, '0')}`);
    const wave = WAVES[this.waveNumber - 1];
    const remaining = Math.max(0, Math.ceil((wave.durationMs - this.waveElapsedMs) / 1000));
    this.waveLabel.setText(this.waveNumber === 5
      ? `第 5 / 5 波 · ${this.bossKilled ? '虫巢已消灭' : `首领决战 ${remaining}s`}`
      : `第 ${this.waveNumber} / 5 波 · ${remaining}s`);
    this.stateLabel.setText(this.deployed ? '火力展开  //  OVERDRIVE' : '机动射击  //  MOBILE');
    this.stateLabel.setColor(this.deployed ? '#ffcd86' : '#c1f7e7');
    this.modeHint.setText(this.deployed
      ? this.build.overload && this.overloadMs < 3000 ? '超载中：高射速！' : '伤害 +35% · 射速 +25%'
      : this.stillMs > 0 ? '停止移动以展开火力' : `已装备 ${this.build.weapons.length} / 4 把武器`);

    const g = this.hudGraphics;
    g.clear();
    g.fillStyle(0x06151f, 0.85);
    g.fillRoundedRect(14, 13, VIEW_W - 28, 67, 14);
    g.lineStyle(1, 0x35626c, 0.45);
    g.strokeRoundedRect(14, 13, VIEW_W - 28, 67, 14);
    for (let i = 0; i < this.build.maxHp; i++) {
      const x = 30 + i * Math.min(25, 200 / this.build.maxHp);
      g.fillStyle(i < this.hp ? 0x6ff2cd : 0x243c45, 1);
      g.fillRoundedRect(x, 52, 19, 9, 3);
    }
    // Explicit progress towards deployment; turns letting go into an intentional decision.
    const progress = Phaser.Math.Clamp(this.stillMs / (GAMEPLAY.deployDelayMs * this.build.deployDelay), 0, 1);
    g.fillStyle(0x06151f, 0.78);
    g.fillRoundedRect(112, this.scale.height - 83, VIEW_W - 224, 15, 7);
    g.fillStyle(this.deployed ? 0xffc077 : 0x62ebd0, 0.95);
    g.fillRoundedRect(115, this.scale.height - 80, (VIEW_W - 230) * progress, 9, 4);
    g.lineStyle(1, 0x72989b, 0.5);
    g.strokeRoundedRect(112, this.scale.height - 83, VIEW_W - 224, 15, 7);
    if (this.waveNumber === 5 && this.bossSpawned && !this.bossKilled) {
      const boss = this.enemyList.find(enemy => enemy.kind === 'boss' && enemy.alive);
      if (boss) {
        g.fillStyle(0x1b2531, 0.95);
        g.fillRoundedRect(40, 119, VIEW_W - 80, 15, 6);
        g.fillStyle(0xe99170, 0.94);
        g.fillRoundedRect(43, 122, (VIEW_W - 86) * Phaser.Math.Clamp(boss.hp / 1500, 0, 1), 9, 4);
      }
    }
  }

  private removeProjectilesAndEnemies(): void {
    this.enemyList.forEach((e) => { e.sprite.destroy(); e.shadow.destroy(); e.warning?.destroy(); });
    this.enemyList = [];
    this.bullets.forEach((b) => b.sprite.destroy());
    this.bullets = [];
    this.acids.forEach(a => a.sprite.destroy());
    this.acids = [];
    this.particles.forEach((p) => p.sprite.destroy());
    this.particles = [];
    this.crosshair?.setVisible(false);
    this.targetingLine?.clear();
  }
}
