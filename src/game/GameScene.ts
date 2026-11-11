import Phaser from 'phaser';
import { createArt } from './Art';
import { SoundFx } from './Sound';
import {
  GAMEPLAY, bulletDamage, fireIntervalMs, formatTime,
  FIXED_STEP_MS, fixedStepBatch, isDeployed, normalizedMove, selectTarget, spawnIntervalMs,
} from './combat';

const VIEW_W = 450;
const WORLD = 2300;
const CENTER = WORLD / 2;
const JOYSTICK_RANGE = 57;

type Enemy = {
  x: number;
  y: number;
  alive: boolean;
  hp: number;
  speed: number;
  size: number;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Arc;
  flashTime: number;
};

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  remainingMs: number;
  sprite: Phaser.GameObjects.Image;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxMs: number;
  sprite: Phaser.GameObjects.Arc;
};

export interface RunResult { kills: number; survived: string; record: number }

/** An immediately playable mobile vertical slice of Endless Swarm. */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private rifle!: Phaser.GameObjects.Image;
  private aura!: Phaser.GameObjects.Arc;
  private targetingLine!: Phaser.GameObjects.Graphics;
  private enemyList: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private lockedTarget: Enemy | null = null;
  private soundFx = new SoundFx();
  private active = false;
  private ready = false;
  private timeMs = 0;
  private simAccumulatorMs = 0;
  private spawnAccumulator = 0;
  private shotAccumulator = 0;
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
    this.shotAccumulator = 0;
    this.stillMs = 0;
    this.deployed = false;
    this.lastHurtMs = -10000;
    this.kills = 0;
    this.hp = GAMEPLAY.playerMaxHealth;
    this.lockedTarget = null;
    this.introFadeMs = 4600;
    this.introHint.setText('拖动屏幕移动  ·  松手展开火力').setAlpha(1);
    this.stateLabel.setText('机动射击');
    this.releaseJoystick();
    this.soundFx.unlock();
    this.active = true;
    this.updateHUD();
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
    this.introFadeMs -= ms;
    if (this.introFadeMs < 1200) this.introHint.setAlpha(Phaser.Math.Clamp(this.introFadeMs / 1200, 0, 1));

    const move = this.movement();
    const moving = Math.hypot(move.x, move.y) > 0.07;
    if (moving) {
      this.player.x = Phaser.Math.Clamp(this.player.x + move.x * GAMEPLAY.moveSpeed * dt, 60, WORLD - 60);
      this.player.y = Phaser.Math.Clamp(this.player.y + move.y * GAMEPLAY.moveSpeed * dt, 60, WORLD - 60);
      this.stillMs = 0;
    } else {
      this.stillMs += ms;
    }
    const nextDeploy = isDeployed(this.stillMs, moving);
    if (nextDeploy && !this.deployed) {
      this.deployBurst();
      this.soundFx.deploy();
    }
    this.deployed = nextDeploy;
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
      this.shotAccumulator += ms;
      const interval = fireIntervalMs(this.deployed);
      if (this.shotAccumulator >= interval) {
        this.shotAccumulator = this.shotAccumulator % interval;
        this.fire(aim);
      }
    } else {
      this.rifle.setPosition(this.player.x + 15, this.player.y + 4);
      this.shotAccumulator = Math.min(this.shotAccumulator + ms, GAMEPLAY.fireIntervalMs);
    }

    this.updateBullets(dt, ms);
    this.updateParticles(dt, ms);
    this.spawnAccumulator += ms;
    if (this.spawnAccumulator >= spawnIntervalMs(this.timeMs / 1000)) {
      this.spawnAccumulator = 0;
      if (this.enemyList.length < GAMEPLAY.maxEnemies) this.spawnEnemy();
    }
    this.updateHUD();
  }

  private spawnEnemy(): void {
    const angle = Math.random() * Math.PI * 2;
    // Spawn beyond view on most edges. On narrow screens some side spawns enter quickly.
    const radius = 430 + Math.random() * 140;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, 40, WORLD - 40);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, 40, WORLD - 40);
    if (Math.hypot(x - this.player.x, y - this.player.y) < 260) return;
    const seconds = this.timeMs / 1000;
    const heavy = seconds > 22 && Math.random() < 0.16;
    const size = heavy ? 1.32 : 0.82 + Math.random() * 0.20;
    const shadow = this.add.circle(x, y + 13, 17 * size, 0x020e12, 0.35).setScale(1, 0.4).setDepth(0);
    const sprite = this.add.image(x, y, 'crawler').setScale(size).setDepth(5);
    if (heavy) sprite.setTint(0xe7bd89);
    this.enemyList.push({ x, y, alive: true, hp: heavy ? 96 : 43, speed: heavy ? 42 : 62 + Math.min(42, seconds * 0.4), size, sprite, shadow, flashTime: 0 });
  }

  private updateEnemies(dt: number, ms: number): void {
    for (const enemy of this.enemyList) {
      if (!enemy.alive) continue;
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.max(0.1, Math.hypot(dx, dy));
      // Stop excessive sprite stacking directly on player.
      const velocity = distance > 19 ? enemy.speed : enemy.speed * 0.2;
      enemy.x += (dx / distance) * velocity * dt;
      enemy.y += (dy / distance) * velocity * dt;
      enemy.sprite.setPosition(enemy.x, enemy.y);
      enemy.shadow.setPosition(enemy.x, enemy.y + 14 * enemy.size);
      enemy.sprite.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      if (enemy.flashTime > 0) {
        enemy.flashTime -= ms;
        if (enemy.flashTime <= 0) enemy.sprite.clearTint();
      }
      if (distance < 22 + enemy.size * 12 && this.timeMs - this.lastHurtMs > GAMEPLAY.hitGraceMs) {
        this.hurt();
      }
    }
  }

  private fire(angle: number): void {
    const muzzleX = this.player.x + Math.cos(angle) * 43;
    const muzzleY = this.player.y + Math.sin(angle) * 43;
    const bullet = this.add.image(muzzleX, muzzleY, 'bolt').setRotation(angle).setDepth(9);
    if (this.deployed) bullet.setTint(0xffd48c).setScale(1.15);
    this.bullets.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(angle) * GAMEPLAY.projectileSpeed,
      vy: Math.sin(angle) * GAMEPLAY.projectileSpeed,
      damage: bulletDamage(this.deployed),
      remainingMs: GAMEPLAY.projectileLifetimeMs,
      sprite: bullet,
    });
    this.spawnSparks(muzzleX, muzzleY, 2, this.deployed ? 0xffc46e : 0x64f6e5, 80);
    this.soundFx.shot();
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
      let hit = false;
      for (const enemy of this.enemyList) {
        if (!enemy.alive) continue;
        // Segment-to-point collision prevents fast bullets tunneling through small enemies.
        const vx = bullet.x - oldX;
        const vy = bullet.y - oldY;
        const len2 = vx * vx + vy * vy;
        const t = len2 > 0 ? Phaser.Math.Clamp(((enemy.x - oldX) * vx + (enemy.y - oldY) * vy) / len2, 0, 1) : 0;
        const cx = oldX + vx * t;
        const cy = oldY + vy * t;
        if (Math.hypot(enemy.x - cx, enemy.y - cy) < 16 * enemy.size + 3) {
          this.damageEnemy(enemy, bullet.damage);
          this.spawnSparks(bullet.x, bullet.y, 3, 0xa5ffd3, 110);
          hit = true;
          break;
        }
      }
      if (hit || bullet.remainingMs <= 0) {
        bullet.sprite.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    enemy.hp -= damage;
    if (enemy.hp > 0) {
      enemy.flashTime = 78;
      enemy.sprite.setTint(0xf5fff6);
      return;
    }
    enemy.alive = false;
    enemy.sprite.destroy();
    enemy.shadow.destroy();
    this.spawnSparks(enemy.x, enemy.y, 7, 0x9ce281, 190);
    this.kills += 1;
    if (this.kills % 3 === 0) this.soundFx.kill();
    if (this.lockedTarget === enemy) this.lockedTarget = null;
    const index = this.enemyList.indexOf(enemy);
    if (index >= 0) this.enemyList.splice(index, 1);
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

  private hurt(): void {
    this.lastHurtMs = this.timeMs;
    this.hp -= 1;
    this.cameras.main.shake(150, 0.006);
    this.player.setTint(0xff6a5b);
    this.soundFx.hurt();
    // Red damage flash is derived from game time; no stale timer can tint a restarted run.
    if (this.hp <= 0) this.finishRun();
  }

  private finishRun(): void {
    this.active = false;
    this.releaseJoystick();
    this.crosshair.setVisible(false);
    this.targetingLine.clear();
    let previous = 0;
    try { previous = Number(localStorage.getItem('endless-swarm-best-kills')) || 0; } catch { /* private browsing */ }
    const record = Math.max(previous, this.kills);
    try { localStorage.setItem('endless-swarm-best-kills', String(record)); } catch { /* optional */ }
    const result: RunResult = { kills: this.kills, survived: formatTime(this.timeMs / 1000), record };
    window.dispatchEvent(new CustomEvent<RunResult>('swarm:gameover', { detail: result }));
  }

  private updateHUD(): void {
    this.clockLabel.setText(formatTime(this.timeMs / 1000));
    this.killLabel.setText(`击杀 ${String(this.kills).padStart(3, '0')}`);
    this.stateLabel.setText(this.deployed ? '火力展开  //  OVERDRIVE' : '机动射击  //  MOBILE');
    this.stateLabel.setColor(this.deployed ? '#ffcd86' : '#c1f7e7');
    this.modeHint.setText(this.deployed ? '伤害 +35%  ·  射速 +25%' : this.stillMs > 0 ? '停止移动以展开火力' : '拖动移动，武器持续攻击');

    const g = this.hudGraphics;
    g.clear();
    g.fillStyle(0x06151f, 0.85);
    g.fillRoundedRect(14, 13, VIEW_W - 28, 67, 14);
    g.lineStyle(1, 0x35626c, 0.45);
    g.strokeRoundedRect(14, 13, VIEW_W - 28, 67, 14);
    for (let i = 0; i < GAMEPLAY.playerMaxHealth; i++) {
      const x = 30 + i * 25;
      g.fillStyle(i < this.hp ? 0x6ff2cd : 0x243c45, 1);
      g.fillRoundedRect(x, 52, 19, 9, 3);
    }
    // Explicit progress towards deployment; turns letting go into an intentional decision.
    const progress = Phaser.Math.Clamp(this.stillMs / GAMEPLAY.deployDelayMs, 0, 1);
    g.fillStyle(0x06151f, 0.78);
    g.fillRoundedRect(112, this.scale.height - 83, VIEW_W - 224, 15, 7);
    g.fillStyle(this.deployed ? 0xffc077 : 0x62ebd0, 0.95);
    g.fillRoundedRect(115, this.scale.height - 80, (VIEW_W - 230) * progress, 9, 4);
    g.lineStyle(1, 0x72989b, 0.5);
    g.strokeRoundedRect(112, this.scale.height - 83, VIEW_W - 224, 15, 7);
  }

  private removeProjectilesAndEnemies(): void {
    this.enemyList.forEach((e) => { e.sprite.destroy(); e.shadow.destroy(); });
    this.enemyList = [];
    this.bullets.forEach((b) => b.sprite.destroy());
    this.bullets = [];
    this.particles.forEach((p) => p.sprite.destroy());
    this.particles = [];
    this.crosshair?.setVisible(false);
    this.targetingLine?.clear();
  }
}
