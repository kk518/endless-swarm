import Phaser from 'phaser';
import { createArt } from './Art';
import { FACTION_COLORS, HIVE_GORE, HIVE_TEXTURE } from './artStyle';
import { bodyOffset, visibleLoadout, visualPowerTier, WEAPON_LIGHT, WEAPON_MOUNTS, type MountedWeapon } from './weaponVisual';
import { SoundFx } from './Sound';
import {
  evolutionRecipeTargets, grantExperience, installWeaponCalibration, killExperience, newGrowth,
  weaponTuning, xpToNext, MAX_RUN_LEVEL,
  type GrowthState,
} from './arsenal';
import {
  GAMEPLAY, fireIntervalMs, formatTime, buildReadout, buildWeaponDamage, buildWeaponInterval,
  FIXED_STEP_MS, fixedStepBatch, isDeployed, normalizedMove, selectTarget,
} from './combat';
import {
  applyCard, newBuild, pickEnemyKind, rollCards,
  type CardDef, type CardId, type EnemyKind, type RunBuild, type WeaponId,
} from './progression';
import { advanceStreak, streakActive, streakDamageMultiplier } from './streak';
import {
  PROTOTYPE_CAMPAIGN, advanceCampaignReward, beginCampaign, getEncounter, tickCampaign,
  type CampaignRunState,
} from './campaignDirector';
import { CONTENT_CATALOG, CURRENT_HERO_ID, resolveHeroLoadout } from './contentCatalog';
import { createRunRandoms, newRunSeed, type RunRandomStreams } from './runRandom';
import {
  canSpawnElite, empStats, MAX_SUPPLIES, overclockDurationMs, rollSupplyKind,
  SUPPLY_PERIOD_MS, SUPPLY_TTL_MS, withinPickupReach, type SupplyKind,
} from './supplies';
import { pressurePlan, spawnOffset, SURGE_PERIOD_MS, SURGE_WARNING_MS } from './pressure';
import { ARRIVAL_WARNING_MS, HUD_DESIGN_WIDTH, insideReadableView, visibleEdgeSpawn, type ViewRect } from './visibility';
import {
  applyAutomaticLevels, applyAutomaticEvolutions, summarizeGrowth,
  DEFAULT_TRAINING, TRAINING_LABELS, type TrainingPlan, type TrainingFocus,
} from './autoGrowth';

const VIEW_W = HUD_DESIGN_WIDTH;
const WORLD = 2300;
const CENTER = WORLD / 2;
const JOYSTICK_RANGE = 57;

type Enemy = {
  kind: EnemyKind;
  elite: boolean;
  eliteAura: Phaser.GameObjects.Arc | null;
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
  burnMs: number;
  burnTickMs: number;
  burnDamage: number;
  attackCooldownMs: number;
  windupMs: number;
  warning: Phaser.GameObjects.Arc | null;
};

type IncomingEnemy = { kind: EnemyKind; elite: boolean; x: number; y: number; remainingMs: number;
  durationMs: number; marker: Phaser.GameObjects.Arc };
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
  color: number;
  sprite: Phaser.GameObjects.Image;
};

type Acid = { x: number; y: number; vx: number; vy: number; remainingMs: number; sprite: Phaser.GameObjects.Image };

type SupplyDrop = {
  kind: SupplyKind; x: number; y: number; remainingMs: number;
  sprite: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Arc;
};

type CombatVisual = {
  kind: 'beam' | 'ring' | 'cone'; x: number; y: number; x2: number; y2: number;
  angle: number; size: number; color: number; ms: number; maxMs: number;
};
type MuzzleFlash = { sprite: Phaser.GameObjects.Image; ms: number; maxMs: number };

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
  victory: boolean; wave: number; weapons: WeaponId[]; cards: string[]; bestStreak: number;
  level: number; weaponLevels: Record<WeaponId, number>; evolutions: string[];
  heroId: string; campaignId: string; runSeed: number;
}
export interface RewardOffer {
  wave: number; options: CardDef[]; nextWave: number; equipped: WeaponId[];
  training: TrainingPlan;
}

/** An immediately playable mobile vertical slice of Endless Swarm. */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private deploymentBraces!: Phaser.GameObjects.Graphics;
  private floorScars!: Phaser.GameObjects.Graphics;
  private scarCount = 0;
  private rifle!: Phaser.GameObjects.Image;
  private mountedWeapons!: Record<MountedWeapon, Phaser.GameObjects.Image>;
  private weaponGlows!: Record<WeaponId, Phaser.GameObjects.Arc>;
  private reactorGlow!: Phaser.GameObjects.Arc;
  private muzzlePoints!: Record<WeaponId, { x: number; y: number }>;
  private combatGraphics!: Phaser.GameObjects.Graphics;
  private combatVisuals: CombatVisual[] = [];
  private muzzleFlashes: MuzzleFlash[] = [];
  private recoilMs: Record<WeaponId, number> = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
  private glowParticleMs = 0;
  private hitStopMs = 0;
  private aura!: Phaser.GameObjects.Arc;
  private targetingLine!: Phaser.GameObjects.Graphics;
  private enemyList: Enemy[] = [];
  private arrivingEnemies: IncomingEnemy[] = [];
  private targetGraceMs = 0;
  private hudLayer!: Phaser.GameObjects.Container;
  private hudScale = 1;
  private bullets: Bullet[] = [];
  private acids: Acid[] = [];
  private particles: Particle[] = [];
  private supplies: SupplyDrop[] = [];
  private supplyElapsedMs = 0;
  private overclockMs = 0;
  private suppliesCollected = 0;
  private lockedTarget: Enemy | null = null;
  private soundFx = new SoundFx();
  private active = false;
  private awaitingReward = false;
  private rewardOptions: CardDef[] = [];
  private campaignRun: CampaignRunState = beginCampaign(PROTOTYPE_CAMPAIGN, 1);
  private randoms: RunRandomStreams = createRunRandoms(1);
  private heroId = CURRENT_HERO_ID;
  private get waveNumber(): number { return this.campaignRun.stageIndex + 1; }
  private get waveElapsedMs(): number { return this.campaignRun.elapsedMs; }
  private get currentStage() { return getEncounter(PROTOTYPE_CAMPAIGN, this.campaignRun.stageIndex); }
  private bossSpawned = false;
  private bossKilled = false;
  private build: RunBuild = newBuild();
  private growth: GrowthState = newGrowth();
  private training: TrainingPlan = { ...DEFAULT_TRAINING };
  private growthNotice = '';
  private growthNoticeMs = 0;
  private weaponCooldowns: Record<WeaponId, number> = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
  private lastDeployedMs = -10000;
  private overloadMs = 0;
  private ready = false;
  private timeMs = 0;
  private simAccumulatorMs = 0;
  private spawnAccumulator = 0;
  private nextSurgeAtMs = SURGE_PERIOD_MS;
  private surgeWarningMs = 0;
  private surgePending = 0;
  private movementHeading = Number.NaN;
  private stillMs = 0;
  private deployed = false;
  private hp: number = GAMEPLAY.playerMaxHealth;
  private lastHurtMs = -10000;
  private kills = 0;
  private streak = 0;
  private bestStreak = 0;
  private lastKillMs = -10000;
  private salvageKills = 0;
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
  private xpLabel!: Phaser.GameObjects.Text;
  private modeHint!: Phaser.GameObjects.Text;
  private growthLabel!: Phaser.GameObjects.Text;
  private buffLabel!: Phaser.GameObjects.Text;
  private introHint!: Phaser.GameObjects.Text;
  private introFadeMs = 0;

  constructor() { super({ key: 'Battle' }); }

  create(): void {
    createArt(this);
    this.cameras.main.setBackgroundColor('#0c141a');
    this.cameras.main.setBounds(0, 0, WORLD, WORLD);

    this.add.tileSprite(CENTER, CENTER, WORLD, WORLD, 'dust').setDepth(-50);
    this.drawWorldDecorations();
    this.floorScars = this.add.graphics().setDepth(-12);
    this.playerShadow = this.add.ellipse(CENTER + 4, CENTER + 13, 61, 30, 0x03080d, 0.64).setDepth(0);
    this.aura = this.add.circle(CENTER, CENTER, 43, 0x72e2d0, 0.04)
      .setStrokeStyle(2, 0x73ddc8, 0.32).setDepth(1);
    this.deploymentBraces = this.add.graphics().setDepth(6).setVisible(false);
    this.drawDeploymentBraces();
    this.player = this.add.image(CENTER, CENTER, 'marine').setDepth(7);
    this.rifle = this.add.image(CENTER + 24, CENTER + 4, 'rifle')
      .setOrigin(0.23, 0.5).setDepth(8);
    this.mountedWeapons = {
      scatter: this.add.image(CENTER, CENTER, 'mount-scatter').setOrigin(0.19, 0.5).setDepth(8).setVisible(false),
      arc: this.add.image(CENTER, CENTER, 'mount-arc').setOrigin(0.18, 0.5).setDepth(8).setVisible(false),
      flame: this.add.image(CENTER, CENTER, 'mount-flame').setOrigin(0.15, 0.5).setDepth(8).setVisible(false),
    };
    this.reactorGlow = this.add.circle(CENTER, CENTER, 11, 0x70ffe6, 0)
      .setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.weaponGlows = {
      rifle: this.add.circle(CENTER, CENTER, 10, WEAPON_LIGHT.rifle, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD),
      scatter: this.add.circle(CENTER, CENTER, 11, WEAPON_LIGHT.scatter, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD),
      arc: this.add.circle(CENTER, CENTER, 11, WEAPON_LIGHT.arc, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD),
      flame: this.add.circle(CENTER, CENTER, 11, WEAPON_LIGHT.flame, 0).setDepth(9).setBlendMode(Phaser.BlendModes.ADD),
    };
    this.muzzlePoints = {
      rifle: { x: CENTER, y: CENTER }, scatter: { x: CENTER, y: CENTER },
      arc: { x: CENTER, y: CENTER }, flame: { x: CENTER, y: CENTER },
    };
    this.combatGraphics = this.add.graphics().setDepth(10);
    this.targetingLine = this.add.graphics().setDepth(3);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);

    // A wider portrait canvas expands the world; the HUD scales independently.
    this.hudScale = this.scale.width / VIEW_W;
    this.hudLayer = this.add.container(0, 0).setScrollFactor(0).setDepth(100).setScale(this.hudScale);
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
  startRun(training: TrainingPlan = DEFAULT_TRAINING): void {
    if (!this.ready) return;
    this.training = { ...DEFAULT_TRAINING };
    this.removeProjectilesAndEnemies();
    this.player.setPosition(CENTER, CENTER).setRotation(0).clearTint();
    this.playerShadow.setPosition(CENTER + 4, CENTER + 13);
    this.deploymentBraces.setVisible(false).setPosition(CENTER, CENTER);
    this.floorScars.clear();
    this.scarCount = 0;
    this.rifle.setPosition(CENTER + 24, CENTER + 4).setRotation(0);
    this.recoilMs = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
    this.glowParticleMs = 0;
    this.hitStopMs = 0;
    this.aura.setPosition(CENTER, CENTER).setAlpha(1);
    this.cameras.main.centerOn(CENTER, CENTER);
    this.targetGraceMs = 0;
    this.timeMs = 0;
    this.simAccumulatorMs = 0;
    this.spawnAccumulator = 500;
    this.nextSurgeAtMs = SURGE_PERIOD_MS;
    this.surgeWarningMs = 0;
    this.surgePending = 0;
    this.movementHeading = Number.NaN;
    this.supplyElapsedMs = 0;
    this.overclockMs = 0;
    this.suppliesCollected = 0;
    this.weaponCooldowns = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
    this.campaignRun = beginCampaign(PROTOTYPE_CAMPAIGN, newRunSeed());
    this.randoms = createRunRandoms(this.campaignRun.seed);
    const loadout = resolveHeroLoadout(CONTENT_CATALOG, CURRENT_HERO_ID);
    // Future catalog entries need runtime attack and passive drivers before
    // they can be chosen; the present renderer supports the base marine.
    if (loadout.standardWeaponIds[0] !== 'rifle' || loadout.signatureWeaponId !== null) {
      throw new Error('Hero runtime adapter has no attack driver for this loadout');
    }
    this.heroId = loadout.heroId;
    this.bossSpawned = false;
    this.bossKilled = false;
    this.awaitingReward = false;
    this.rewardOptions = [];
    this.build = newBuild();
    this.growth = newGrowth();
    this.setTraining(training.weapon, training.focus);
    this.growthNotice = '';
    this.growthNoticeMs = 0;
    this.refreshMountedWeapons();
    this.lastDeployedMs = -10000;
    this.overloadMs = 0;
    this.stillMs = 0;
    this.deployed = false;
    this.lastHurtMs = -10000;
    this.kills = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastKillMs = -10000;
    this.salvageKills = 0;
    this.hp = this.build.hp;
    this.lockedTarget = null;
    this.introFadeMs = 4600;
    this.introHint.setText('经验自动升级 · 松手展开火力 · 波末选择构筑').setAlpha(1);
    this.stateLabel.setText('机动射击');
    this.releaseJoystick();
    this.soundFx.unlock();
    this.active = true;
    this.updateHUD();
  }

  /** Configure deterministic automatic training. The next rank always follows this plan. */
  setTraining(weapon: WeaponId, focus: TrainingFocus): void {
    const allowedFocus: readonly string[] = ['damage', 'rate', 'speed'];
    if (!allowedFocus.includes(focus)) return;
    this.training.focus = focus;
    if (this.build.weapons.includes(weapon)) this.training.weapon = weapon;
  }

  currentTraining(): TrainingPlan { return { ...this.training }; }

  /** The DOM reward UI is the only allowed path to resume a completed wave. */
  chooseCard(cardId: string): boolean {
    const chosen = this.rewardOptions.find(card => card.id === cardId);
    if (!this.awaitingReward || !chosen) return false;
    this.build.hp = this.hp;
    if (!applyCard(this.build, cardId as CardId)) return false;
    if (chosen.weapon) installWeaponCalibration(this.growth, chosen.weapon);
    const newEvolutions = applyAutomaticEvolutions(this.build, this.growth);
    if (newEvolutions.length) {
      this.growthNotice = summarizeGrowth({ upgrades: [], evolutions: newEvolutions }, this.growth);
      this.growthNoticeMs = 2100;
    }
    this.refreshMountedWeapons();
    if (cardId === 'scatter-kit' || cardId === 'arc-kit' || cardId === 'flame-kit') {
      const color = WEAPON_LIGHT[chosen.weapon!];
      this.spawnSparks(this.player.x, this.player.y, 20, color, 220);
      this.addCombatVisual('ring', this.player.x, this.player.y, this.player.x, this.player.y, color, 74, 240);
    }
    if (cardId === 'salvage') this.salvageKills = 0;
    this.streak = 0;
    this.lastKillMs = -10000;
    this.hp = Math.min(this.build.maxHp, this.build.hp + 1); // field repair between waves
    this.build.hp = this.hp;
    this.campaignRun = advanceCampaignReward(PROTOTYPE_CAMPAIGN, this.campaignRun);
    this.nextSurgeAtMs = SURGE_PERIOD_MS;
    this.surgeWarningMs = 0;
    this.surgePending = 0;
    this.supplyElapsedMs = 0;
    this.overclockMs = 0;
    this.spawnAccumulator = 800;
    this.weaponCooldowns = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
    this.bossSpawned = false;
    this.bossKilled = false;
    this.awaitingReward = false;
    this.rewardOptions = [];
    this.simAccumulatorMs = 0;
    this.releaseJoystick();
    this.introFadeMs = 3500;
    this.introHint.setText(`强化生效：${chosen.name} · ${this.currentStage.actTitle}第 ${this.waveNumber} 段`).setAlpha(1);
    this.spawnSparks(this.player.x, this.player.y, 18, 0x79f8dc, 170);
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

  private get hudHeight(): number { return this.scale.height / this.hudScale; }

  private layoutHUD(): void {
    if (!this.ready) return;
    this.hudScale = this.scale.width / VIEW_W;
    this.hudLayer.setScale(this.hudScale);
    this.stateLabel.setY(this.hudHeight - 123);
    this.modeHint.setY(this.hudHeight - 99);
    this.buffLabel.setY(this.hudHeight - 158);
    this.introHint.setY(this.hudHeight - 195);
    this.releaseJoystick();
    this.updateHUD();
  }

  private drawWorldDecorations(): void {
    const g = this.add.graphics().setDepth(-40);
    // Ruined forward operating base: hazard paint, grates and broken service plating.
    // These are drawn once as one Graphics object, never recreated each frame.
    g.lineStyle(7, 0x070f16, 0.6); g.strokeCircle(CENTER, CENTER, 455);
    g.lineStyle(2, 0x637377, 0.42); g.strokeCircle(CENTER, CENTER, 455);
    g.lineStyle(8, 0x182b33, 0.53); g.strokeCircle(CENTER, CENTER, 730);
    g.lineStyle(2, 0xf4aa65, 0.4); g.strokeCircle(CENTER, CENTER, 738);
    for (let i = 0; i < 40; i++) {
      const angle = i * Math.PI / 20;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const x = CENTER + ca * 450, y = CENTER + sa * 450;
      g.lineStyle(4, i % 5 === 0 ? 0xf3af70 : 0x5a7275, i % 5 === 0 ? 0.7 : 0.35);
      g.lineBetween(x - ca * 11, y - sa * 11, x + ca * 17, y + sa * 17);
    }
    // Four large broken installation plates with panel seams and rivet clusters.
    for (let i = 0; i < 36; i++) {
      const x = 110 + (i * 357) % (WORLD - 220);
      const y = 115 + (i * 601) % (WORLD - 230);
      if (Math.hypot(x - CENTER, y - CENTER) < 260) continue;
      const w = 65 + (i % 4) * 25;
      g.fillStyle(0x050b11, 0.46); g.fillRoundedRect(x + 6, y + 7, w, 36, 3);
      g.fillStyle(0x27353d, 0.54); g.fillRoundedRect(x, y, w, 34, 2);
      g.lineStyle(1.4, 0x748285, 0.38); g.strokeRoundedRect(x, y, w, 34, 2);
      g.lineStyle(1, 0x111e26, 0.8); g.lineBetween(x + 23, y + 2, x + 23, y + 32);
      g.fillStyle(0xa4ada2, 0.45); g.fillCircle(x + 7, y + 6, 1.5);
      g.fillCircle(x + w - 6, y + 28, 1.5);
      if (i % 3 === 0) {
        for (let t = 0; t < 4; t++) {
          g.fillStyle(0xc38a56, 0.44);
          g.fillTriangle(x + 31 + t * 11, y + 24, x + 36 + t * 11, y + 15, x + 41 + t * 11, y + 24);
        }
      }
    }
    // Chitinous veins press inward from the perimeter; the hive is consuming the base.
    for (let i = 0; i < 46; i++) {
      const t = i * 2.39996;
      const radius = 560 + (i * 181) % 500;
      const x = CENTER + Math.cos(t) * radius, y = CENTER + Math.sin(t) * radius;
      const size = 19 + i % 5 * 9;
      g.fillStyle(0x532d3b, 0.18); g.fillEllipse(x, y, size * 2, size * 1.2);
      g.lineStyle(2, 0x8d4e57, 0.31);
      g.lineBetween(x - size, y + 4, x, y - size);
      g.lineBetween(x, y - size, x + size * 0.8, y + size * 0.3);
      g.lineBetween(x, y - size, x + size * 0.2, y - size * 1.5);
      g.fillStyle(0xb77a69, 0.32); g.fillCircle(x, y - size, 2.5);
    }
    // The deployment center remains navigationally clear but feels manufactured.
    g.lineStyle(2, 0xf0ac64, 0.4);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      const px = CENTER + x * 150, py = CENTER + y * 150;
      g.lineBetween(px, py, px - x * 26, py);
      g.lineBetween(px, py, px, py - y * 26);
    }
  }

  private drawDeploymentBraces(): void {
    const g = this.deploymentBraces;
    g.lineStyle(8, 0x0e1b21, 0.86);
    for (const sign of [-1, 1]) {
      g.lineBetween(sign * 20, -17, sign * 49, -39);
      g.lineBetween(sign * 20, 20, sign * 49, 41);
      g.lineStyle(4, 0x748b85, 0.95);
      g.lineBetween(sign * 22, -17, sign * 45, -36);
      g.lineBetween(sign * 22, 20, sign * 45, 38);
      g.fillStyle(0x1c3037); g.fillRoundedRect(sign * 45 - 6, -44, 12, 13, 2);
      g.fillRoundedRect(sign * 45 - 6, 35, 12, 13, 2);
      g.fillStyle(0xf9b66a); g.fillRect(sign * 45 - 3, -41, 6, 3);
      g.fillRect(sign * 45 - 3, 38, 6, 3);
      g.lineStyle(8, 0x0e1b21, 0.86);
    }
  }

  private stampSplat(x: number, y: number, kind: EnemyKind): void {
    if (++this.scarCount > 180) { this.floorScars.clear(); this.scarCount = 1; }
    const g = this.floorScars;
    const tint = HIVE_GORE[kind];
    const seed = this.scarCount * 1.61;
    const radius = kind === 'boss' ? 28 : 7 + (this.scarCount % 4) * 2;
    g.fillStyle(0x120f17, 0.18); g.fillEllipse(x + 3, y + 5, radius * 3, radius * 1.9);
    g.fillStyle(tint, 0.24); g.fillEllipse(x, y, radius * 2.3, radius * 1.3);
    for (let i = 0; i < 5; i++) {
      const angle = seed + i * 2.1;
      g.fillStyle(tint, 0.24);
      g.fillCircle(x + Math.cos(angle) * radius * 1.2, y + Math.sin(angle) * radius * 0.9, 1 + i % 3);
    }
  }

  private hudText(x: number, y: number, value: string, size: string, color: string): Phaser.GameObjects.Text {
    const item = this.add.text(x, y, value, {
      fontFamily: 'Bahnschrift, DIN Alternate, Arial Narrow, Arial, sans-serif',
      fontSize: size, color, fontStyle: 'bold',
      stroke: '#07171e', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(110);
    this.hudLayer.add(item);
    return item;
  }

  private buildHUD(): void {
    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudLayer.add(this.hudGraphics);
    this.hudText(30, 21, 'A R M O R  /  装甲', '12px', '#bed1c5');
    this.clockLabel = this.hudText(VIEW_W - 27, 21, '00:00', '26px', '#f3faf5').setOrigin(1, 0);
    this.killLabel = this.hudText(VIEW_W - 28, 55, '击杀 000', '14px', '#92d8c2').setOrigin(1, 0);
    this.waveLabel = this.hudText(VIEW_W / 2, 94, '前沿登陆 · 1/5', '17px', '#ffbd78').setOrigin(0.5, 0);
    this.xpLabel = this.hudText(31, 140, 'LV.1 | 0/8 XP', '12px', '#a9f1d9');
    this.growthLabel = this.hudText(VIEW_W / 2, 179, '', '12px', '#f6d08a').setOrigin(0.5, 0);
    this.stateLabel = this.hudText(VIEW_W / 2, this.hudHeight - 123, '机动射击', '18px', '#c1f7e7').setOrigin(0.5, 0.5);
    this.modeHint = this.hudText(VIEW_W / 2, this.hudHeight - 99, '移动射击中', '12px', '#79a2a9').setOrigin(0.5, 0.5);
    this.buffLabel = this.hudText(VIEW_W / 2, this.hudHeight - 158, '', '16px', '#91eaf8').setOrigin(0.5, 0.5);
    this.introHint = this.hudText(VIEW_W / 2, this.hudHeight - 195, '', '16px', '#fcdb9b').setOrigin(0.5, 0.5);
    this.crosshair = this.add.circle(0, 0, 17, 0x79ffe9, 0).setStrokeStyle(1.6, 0xf5c180, 0.85)
      .setDepth(5).setVisible(false);
  }

  private buildJoystick(): void {
    this.joystickBase = this.add.circle(90, 680, JOYSTICK_RANGE, 0x4b8185, 0.09)
      .setStrokeStyle(2, 0xb4c7b8, 0.58).setScrollFactor(0).setDepth(120).setVisible(false);
    this.joystickKnob = this.add.circle(90, 680, 24, 0x6b9d9e, 0.49)
      .setStrokeStyle(2, 0xeff1d7, 0.84).setScrollFactor(0).setDepth(121).setVisible(false);
    this.hudLayer.add([this.joystickBase, this.joystickKnob]);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.active || this.joystickPointer !== null) return;
    // Reserve the upper HUD/battle-visibility area; either thumb can play in the lower area.
    if (pointer.y < this.scale.height * 0.42) return;
    this.joystickPointer = pointer.id;
    const x = pointer.x / this.hudScale, y = pointer.y / this.hudScale;
    this.joystickOrigin = { x, y };
    this.joystickBase.setPosition(x, y).setVisible(true);
    this.joystickKnob.setPosition(x, y).setVisible(true);
    this.updateJoystick(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointer) this.updateJoystick(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.joystickPointer) this.releaseJoystick();
  }

  private updateJoystick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x / this.hudScale - this.joystickOrigin.x;
    const dy = pointer.y / this.hudScale - this.joystickOrigin.y;
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
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - ms);
      this.updateCombatVisuals(ms);
      return;
    }
    const dt = ms / 1000;
    this.timeMs += ms;
    this.campaignRun.elapsedMs += ms;
    this.overclockMs = Math.max(0, this.overclockMs - ms);
    if (!streakActive(this.streak, this.lastKillMs, this.timeMs)) this.streak = 0;
    this.growthNoticeMs = Math.max(0, this.growthNoticeMs - ms);
    this.introFadeMs -= ms;
    if (this.introFadeMs < 1200) this.introHint.setAlpha(Phaser.Math.Clamp(this.introFadeMs / 1200, 0, 1));

    const move = this.movement();
    const moving = Math.hypot(move.x, move.y) > 0.07;
    if (moving) {
      this.movementHeading = Math.atan2(move.y, move.x);
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
    this.aura.setPosition(this.player.x, this.player.y).setRadius(this.deployed ? 53 : 37)
      .setFillStyle(this.deployed ? 0xf3a365 : 0x65b7bb, this.deployed ? 0.12 : 0.04)
      .setStrokeStyle(this.deployed ? 3 : 2, this.deployed ? 0xffae64 : 0x6fc7c4, this.deployed ? 0.9 : 0.25);
    this.deploymentBraces.setVisible(this.deployed).setPosition(this.player.x, this.player.y)
      .setRotation(this.player.rotation);
    this.playerShadow.setPosition(this.player.x + 5, this.player.y + 14);
    if (this.timeMs - this.lastHurtMs < 170) this.player.setTint(0xff7666);
    else this.player.clearTint();

    this.updateArrivals(ms);
    this.updateEnemies(dt, ms);
    if (!this.active) return; // Contact damage can end a run before the rest of this step.
    const rifleRange = GAMEPLAY.fireRange * this.build.range;
    const visibleTarget = selectTarget(this.player, this.readableEnemies(), rifleRange, this.lockedTarget);
    if (visibleTarget) {
      this.lockedTarget = visibleTarget;
      this.targetGraceMs = 250;
    } else if (this.lockedTarget?.alive && this.targetGraceMs > 0
      && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.lockedTarget.x, this.lockedTarget.y) <= rifleRange) {
      this.targetGraceMs -= ms;
    } else {
      this.lockedTarget = null;
      this.targetGraceMs = 0;
    }
    this.crosshair.setVisible(Boolean(this.lockedTarget));
    this.targetingLine.clear();
    if (this.lockedTarget) {
      const target = this.lockedTarget;
      const aim = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      this.player.setRotation(aim + Math.PI / 2);
      this.rifle.setRotation(aim);
      this.rifle.setPosition(this.player.x + Math.cos(aim) * 15, this.player.y + Math.sin(aim) * 15);
      this.crosshair.setPosition(target.x, target.y);
    } else {
      this.rifle.setPosition(this.player.x + 15, this.player.y + 4);
    }
    this.updateWeaponRig(ms);
    this.updateWeapons(ms);
    this.updateBullets(dt, ms);
    if (!this.active) return;
    this.updateAcids(dt, ms);
    if (!this.active) return;
    this.updateParticles(dt, ms);
    this.updateCombatVisuals(ms);
    this.updateSupplies(ms);
    this.supplyElapsedMs += ms;
    if (this.supplyElapsedMs >= SUPPLY_PERIOD_MS) {
      this.supplyElapsedMs -= SUPPLY_PERIOD_MS;
      this.spawnSupplyNearPlayer();
    }
    const wave = this.currentStage.encounter.wave;
    const pressure = pressurePlan(this.currentStage.encounter.pressureTier, this.waveElapsedMs, wave.durationMs);
    this.spawnAccumulator += ms;
    if (this.spawnAccumulator >= pressure.intervalMs) {
      this.spawnAccumulator -= pressure.intervalMs;
      this.spawnPack(pressure.groupSize, pressure.spawnRadius);
    }
    if (this.waveElapsedMs >= this.nextSurgeAtMs && this.surgePending === 0) {
      this.surgePending = pressure.surgeSize;
      this.surgeWarningMs = SURGE_WARNING_MS;
      this.nextSurgeAtMs += SURGE_PERIOD_MS;
      this.introHint.setText('⚠ 虫潮集结！注意两侧包围').setAlpha(1);
      this.introFadeMs = SURGE_WARNING_MS + 1100;
    }
    if (this.surgePending > 0) {
      this.surgeWarningMs -= ms;
      if (this.surgeWarningMs <= 0) {
        this.spawnPack(this.surgePending, pressure.spawnRadius);
        this.surgePending = 0;
        this.spawnSparks(this.player.x, this.player.y, 10, 0xffa564, 130);
      }
    }
    if (this.currentStage.encounter.kind === 'boss' && !this.bossSpawned && this.waveElapsedMs > 2500) {
      this.bossSpawned = this.spawnEnemy('boss');
      if (this.bossSpawned) {
        this.introHint.setText('警告：虫巢巨兽接近！').setAlpha(1);
        this.introFadeMs = 2800;
      }
    }
    this.campaignRun = tickCampaign(PROTOTYPE_CAMPAIGN, this.campaignRun, 0, this.bossKilled);
    const phase = this.campaignRun.phase;
    if (phase === 'victory') this.finishRun(true);
    else if (phase === 'timeout') this.finishRun(false);
    else if (phase === 'reward') this.endWave();
    this.updateHUD();
  }

  private endWave(): void {
    this.active = false;
    this.awaitingReward = true;
    this.releaseJoystick();
    this.removeProjectilesAndEnemies();
    this.lockedTarget = null;
    this.rewardOptions = rollCards(this.build, this.waveNumber, () => this.randoms.rewards.next(), evolutionRecipeTargets(this.build, this.growth));
    const detail: RewardOffer = {
      wave: this.waveNumber, nextWave: this.waveNumber + 1, options: this.rewardOptions,
      equipped: [...this.build.weapons], training: this.currentTraining(),
    };
    window.dispatchEvent(new CustomEvent<RewardOffer>('swarm:reward', { detail }));
  }

  private spawnPack(count: number, radius: number): void {
    const wave = this.currentStage.encounter.wave;
    const heading = Number.isFinite(this.movementHeading) ? this.movementHeading
      : this.randoms.combat.next() * Math.PI * 2;
    const sector = heading + (this.randoms.combat.next() - 0.5) * 0.55;
    let eliteCount = this.enemyList.reduce((count, enemy) => count + Number(enemy.elite && enemy.alive), 0)
      + this.arrivingEnemies.reduce((count, enemy) => count + Number(enemy.elite), 0);
    for (let i = 0; i < count && this.enemyList.length + this.arrivingEnemies.length < wave.maxEnemies; i++) {
      const kind = pickEnemyKind(wave, () => this.randoms.combat.next());
      const elite = canSpawnElite(this.currentStage.encounter.pressureTier, kind, eliteCount, () => this.randoms.combat.next());
      if (this.spawnEnemy(kind, elite, sector + spawnOffset(i), radius) && elite) eliteCount++;
    }
  }

  private combatView(): ViewRect {
    const camera = this.cameras.main, view = camera.worldView;
    const left = view.width > 0 ? view.x : camera.scrollX;
    const top = view.height > 0 ? view.y : camera.scrollY;
    return { left, top, right: left + this.scale.width, bottom: top + this.scale.height };
  }

  private readableEnemies(): Enemy[] {
    if (this.scale.width <= VIEW_W) return this.enemyList;
    const view = this.combatView();
    return this.enemyList.filter(enemy => insideReadableView(enemy, view));
  }

  private spawnEnemy(kind: EnemyKind, elite = false, preferredAngle?: number, baseRadius?: number): boolean {
    const radius = kind === 'boss' ? 315 : (baseRadius ?? 410) + this.randoms.combat.next() * 65;
    const angle = preferredAngle ?? this.randoms.combat.next() * Math.PI * 2;
    const view = this.combatView();
    let location: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const trial = angle + attempt * Math.PI * 0.75;
      if (this.scale.width > VIEW_W) {
        location = visibleEdgeSpawn(this.player, view, trial, WORLD, radius,
          kind === 'boss' ? 215 : 245, kind === 'boss' ? 26 : 16);
      } else {
        const x = Phaser.Math.Clamp(this.player.x + Math.cos(trial) * radius, 40, WORLD - 40);
        const y = Phaser.Math.Clamp(this.player.y + Math.sin(trial) * radius, 40, WORLD - 40);
        if (Math.hypot(x - this.player.x, y - this.player.y) >= 275) location = { x, y };
      }
      if (location) break;
    }
    if (!location) return false;
    const { x, y } = location;
    const color = kind === 'boss' ? 0xff8568 : elite ? 0xffba6b : 0xe36b70;
    const marker = this.add.circle(x, y, kind === 'boss' ? 43 : 19, color, 0.13)
      .setStrokeStyle(kind === 'boss' ? 4 : 2, color, 0.85).setDepth(3);
    const durationMs = kind === 'boss' ? 1050 : ARRIVAL_WARNING_MS;
    this.arrivingEnemies.push({ kind, elite, x, y, remainingMs: durationMs, durationMs, marker });
    return true;
  }

  private updateArrivals(ms: number): void {
    for (let i = this.arrivingEnemies.length - 1; i >= 0; i--) {
      const arrival = this.arrivingEnemies[i];
      arrival.remainingMs -= ms;
      if (arrival.remainingMs > 0) {
        const phase = 1 - arrival.remainingMs / arrival.durationMs;
        arrival.marker.setScale(0.75 + phase * 0.7).setAlpha(0.4 + phase * 0.6);
        continue;
      }
      this.arrivingEnemies.splice(i, 1);
      arrival.marker.destroy();
      this.materializeEnemy(arrival.kind, arrival.elite, arrival.x, arrival.y);
    }
  }

  private materializeEnemy(kind: EnemyKind, elite: boolean, x: number, y: number): void {
    const def: Record<EnemyKind, { hp: number; speed: number; size: number; color: number }> = {
      grunt: { hp: 42, speed: 83, size: 0.92, color: 0xffffff },
      leaper: { hp: 45, speed: 125, size: 0.84, color: 0xf2a867 },
      armored: { hp: 132, speed: 54, size: 1.38, color: 0xa0b8e0 },
      bomber: { hp: 56, speed: 102, size: 1.02, color: 0xffffff },
      spitter: { hp: 65, speed: 62, size: 1.05, color: 0xb3ee83 },
      boss: { hp: 1500, speed: 55, size: 3.0, color: 0xe99578 },
    };
    const base = def[kind];
    const stats = elite
      ? { ...base, hp: Math.round(base.hp * 2.3), speed: base.speed * 1.12, size: base.size * 1.2 }
      : base;
    const shadow = this.add.circle(x + 5, y + 14, 22 * stats.size, 0x01080e, 0.53).setScale(1, 0.39).setDepth(0);
    const eliteAura = elite
      ? this.add.circle(x, y, 31 * stats.size, 0xb76554, 0.04)
          .setStrokeStyle(2, 0xf6ab77, 0.86).setDepth(3)
      : null;
    const sprite = this.add.image(x, y, HIVE_TEXTURE[kind])
      .setScale(stats.size * (kind === 'boss' ? 0.9 : kind === 'armored' ? 0.9 : 0.83))
      .setDepth(kind === 'boss' ? 6 : 5);
    if (elite) sprite.setTint(0xf4c6a9);
    const warning = kind === 'leaper' || kind === 'spitter' || kind === 'boss' || kind === 'bomber'
      ? this.add.circle(x, y, kind === 'boss' ? 65 : kind === 'bomber' ? 105 : 26,
        kind === 'bomber' ? 0xff537e : 0xff745c, kind === 'bomber' ? 0.17 : 0.13)
        .setStrokeStyle(2, kind === 'bomber' ? 0xff7596 : 0xffa271, 0.7).setDepth(2).setVisible(false)
      : null;
    const pressure = pressurePlan(this.currentStage.encounter.pressureTier, this.waveElapsedMs, this.currentStage.encounter.wave.durationMs);
    this.enemyList.push({
      kind, elite, eliteAura, x, y, alive: true, hp: stats.hp, speed: stats.speed * pressure.speedMultiplier, size: stats.size,
      sprite, shadow, warning, flashTime: 0, slowMs: 0,
      burnMs: 0, burnTickMs: 0, burnDamage: 0,
      attackCooldownMs: 1900 + this.randoms.combat.next() * 1500, windupMs: 0,
    });
  }

  private updateEnemies(dt: number, ms: number): void {
    // Snapshot keeps burn deaths from invalidating a live index traversal.
    for (const enemy of [...this.enemyList]) {
      if (!enemy.alive) continue;
      if (enemy.burnMs > 0) {
        enemy.burnMs = Math.max(0, enemy.burnMs - ms);
        enemy.burnTickMs -= ms;
        if (enemy.burnTickMs <= 0) {
          enemy.burnTickMs += 250;
          this.damageEnemy(enemy, enemy.burnDamage);
          if (!enemy.alive) continue;
        }
      }
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const distance = Math.max(0.1, Math.hypot(dx, dy));
      enemy.slowMs = Math.max(0, enemy.slowMs - ms);
      enemy.attackCooldownMs -= ms;
      const special = enemy.kind === 'leaper' || enemy.kind === 'spitter' || enemy.kind === 'boss';
      if (enemy.kind === 'bomber' && distance < 110 && enemy.windupMs <= 0) {
        enemy.windupMs = 850; // visible blast radius; moving out or killing it prevents damage
        enemy.warning?.setVisible(true);
      }
      if (special && enemy.attackCooldownMs <= 0 && enemy.windupMs <= 0) {
        enemy.windupMs = enemy.kind === 'boss' ? 900 : enemy.kind === 'spitter' ? 700 : 530;
        enemy.warning?.setVisible(true);
      }
      if (enemy.windupMs > 0) {
        enemy.windupMs -= ms;
        enemy.warning?.setPosition(enemy.x, enemy.y)
          .setAlpha(0.65 + Math.sin(this.timeMs / 80) * 0.3)
          .setScale(0.96 + Math.sin(this.timeMs / 115) * 0.04);
        if (enemy.windupMs <= 0) {
          enemy.warning?.setVisible(false);
          if (enemy.kind === 'bomber') {
            this.detonateBomber(enemy);
            if (!this.active) return;
            continue;
          }
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
      enemy.shadow.setPosition(enemy.x + 5, enemy.y + 14 * enemy.size);
      enemy.eliteAura?.setPosition(enemy.x, enemy.y).setAlpha(0.65 + Math.sin(this.timeMs / 260) * 0.25);
      enemy.sprite.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      if (enemy.flashTime > 0) {
        enemy.flashTime -= ms;
        if (enemy.flashTime <= 0) {
          if (enemy.burnMs > 0) enemy.sprite.setTint(0xf6a073);
          else if (enemy.slowMs > 0) enemy.sprite.setTint(0x94cfdf);
          else if (enemy.elite) enemy.sprite.setTint(0xf4c6a9);
          else enemy.sprite.clearTint();
        }
      }
      if (enemy.kind !== 'bomber' && distance < 19 + enemy.size * 14 && this.timeMs - this.lastHurtMs > GAMEPLAY.hitGraceMs) {
        this.hurt(enemy.kind === 'boss' || enemy.elite ? 2 : 1);
        if (!this.active) return;
      }
    }
  }

  /** The red warning zone is dangerous only when its 850ms fuse expires. */
  private detonateBomber(enemy: Enemy): void {
    enemy.alive = false;
    enemy.sprite.destroy();
    enemy.shadow.destroy();
    enemy.warning?.destroy();
    enemy.eliteAura?.destroy();
    const index = this.enemyList.indexOf(enemy);
    if (index >= 0) this.enemyList.splice(index, 1);
    this.stampSplat(enemy.x, enemy.y, 'bomber');
    this.addCombatVisual('ring', enemy.x, enemy.y, enemy.x, enemy.y, 0xff5d7a, 103, 260);
    this.spawnSparks(enemy.x, enemy.y, 20, HIVE_GORE.bomber, 230);
    const distance = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
    if (distance < 260) this.cameras.main.shake(100, 0.002);
    if (distance <= 105 && this.timeMs - this.lastHurtMs > GAMEPLAY.hitGraceMs) this.hurt(2);
  }

  private weaponDamage(base: number): number {
    return buildWeaponDamage(base, this.build, this.deployed, this.timeMs - this.lastDeployedMs < 1200, this.streak);
  }

  private weaponInterval(base: number): number {
    return buildWeaponInterval(base, this.build, this.deployed, this.overloadMs < 3000, this.overclockMs > 0);
  }

  /** Hardware is always physically mounted only when the corresponding card is owned. */
  private refreshMountedWeapons(): void {
    for (const id of ['scatter', 'arc', 'flame'] as const) {
      this.mountedWeapons[id].setVisible(this.build.weapons.includes(id));
    }
    for (const id of ['rifle', 'scatter', 'arc', 'flame'] as const) {
      this.weaponGlows[id].setVisible(this.build.weapons.includes(id));
    }
  }

  /** One human-shaped body with three independent slots that rotate around the suit. */
  private updateWeaponRig(ms: number): void {
    const tier = visualPowerTier(this.build);
    const rotation = this.player.rotation;
    const aim = this.rifle.rotation;
    const pulse = 0.76 + Math.sin(this.timeMs / 112) * 0.24;
    const burst = this.overclockMs > 0 || this.deployed ? 0.18 : 0;
    const rifleRecoil = this.recoilMs.rifle / 90;
    this.rifle.x -= Math.cos(aim) * rifleRecoil * 7;
    this.rifle.y -= Math.sin(aim) * rifleRecoil * 7;
    this.muzzlePoints.rifle = {
      x: this.rifle.x + Math.cos(aim) * 43,
      y: this.rifle.y + Math.sin(aim) * 43,
    };
    for (const id of ['scatter', 'arc', 'flame'] as const) {
      const meta = WEAPON_MOUNTS[id];
      const offset = bodyOffset(meta.x, meta.y, rotation);
      const mount = this.mountedWeapons[id];
      const recoil = this.recoilMs[id] / 130 * 8;
      mount.setPosition(
        this.player.x + offset.x - Math.cos(aim) * recoil,
        this.player.y + offset.y - Math.sin(aim) * recoil,
      ).setRotation(aim);
      this.muzzlePoints[id] = {
        x: mount.x + Math.cos(aim) * meta.muzzle,
        y: mount.y + Math.sin(aim) * meta.muzzle,
      };
      mount.setScale(this.deployed ? 1.11 : 1);
    }
    const bodyGlow = bodyOffset(0, -8, rotation);
    this.reactorGlow.setPosition(this.player.x + bodyGlow.x, this.player.y + bodyGlow.y)
      .setRadius(8 + tier * 2.8 + (this.deployed ? 3 : 0))
      .setAlpha(tier ? Math.min(0.78, 0.13 + tier * 0.11 + burst) * pulse : this.deployed ? 0.3 : 0.08);
    for (const id of visibleLoadout(this.build.weapons)) {
      const pos = this.muzzlePoints[id];
      this.weaponGlows[id].setPosition(pos.x, pos.y)
        .setRadius(7 + tier * 3 + (this.deployed ? 4 : 0))
        .setAlpha(tier ? Math.min(0.78, (0.12 + tier * 0.13 + burst) * pulse) : this.deployed ? 0.25 : 0.025);
    }
    for (const id of ['rifle', 'scatter', 'arc', 'flame'] as const) {
      this.recoilMs[id] = Math.max(0, this.recoilMs[id] - ms);
    }
    if (tier >= 2) {
      this.glowParticleMs += ms;
      if (this.glowParticleMs >= (tier >= 3 ? 90 : 145)) {
        this.glowParticleMs = 0;
        const equipped = visibleLoadout(this.build.weapons);
        const id = equipped[Math.floor(this.timeMs / 223) % equipped.length];
        const pos = this.muzzlePoints[id];
        this.spawnSparks(pos.x, pos.y, tier >= 3 ? 2 : 1, WEAPON_LIGHT[id], 53);
      }
    }
  }

  private addCombatVisual(
    kind: CombatVisual['kind'], x: number, y: number, x2: number, y2: number,
    color: number, size: number, lifeMs: number,
  ): void {
    // On a phone, short lived drawing commands are cheaper than hundreds of
    // persistent Phaser sprites or one WebGL object per flame/spark.
    if (this.combatVisuals.length >= 68) this.combatVisuals.shift();
    this.combatVisuals.push({
      kind, x, y, x2, y2, angle: Math.atan2(y2 - y, x2 - x),
      size, color, ms: lifeMs, maxMs: lifeMs,
    });
  }

  private burstMuzzle(id: WeaponId, angle: number, scale = 1): void {
    const point = this.muzzlePoints[id];
    const tier = visualPowerTier(this.build);
    this.recoilMs[id] = id === 'scatter' ? 115 : id === 'arc' ? 95 : 65;
    if (this.muzzleFlashes.length < 32) {
      const sprite = this.add.image(point.x, point.y, 'muzzle-flash')
        .setOrigin(0.16, 0.5).setRotation(angle)
        .setDepth(11).setScale((0.38 + tier * 0.11) * scale)
        .setTint(WEAPON_LIGHT[id]).setBlendMode(Phaser.BlendModes.ADD);
      this.muzzleFlashes.push({ sprite, ms: 95, maxMs: 95 });
    }
    if (id === 'scatter') this.addCombatVisual(
      'cone', point.x, point.y, point.x + Math.cos(angle) * 95, point.y + Math.sin(angle) * 95,
      WEAPON_LIGHT.scatter, 0.47, 175,
    );
    if (id === 'flame') this.addCombatVisual(
      'cone', point.x, point.y, point.x + Math.cos(angle) * 125, point.y + Math.sin(angle) * 125,
      WEAPON_LIGHT.flame, 0.37, 165,
    );
    this.soundFx.weaponShot(id, tier);
  }

  private updateCombatVisuals(ms: number): void {
    const graphics = this.combatGraphics;
    graphics.clear();
    const tier = visualPowerTier(this.build);
    // Each physical projectile draws a bright hot core and a soft streak tail.
    // The number of commands is clamped; collision simulation remains unchanged.
    for (let i = 0; i < this.bullets.length && i < 85; i++) {
      const bullet = this.bullets[i];
      const tailTime = 0.028 + tier * 0.009;
      const tx = bullet.x - bullet.vx * tailTime;
      const ty = bullet.y - bullet.vy * tailTime;
      graphics.lineStyle(5 + tier, bullet.color, 0.10 + tier * 0.03);
      graphics.lineBetween(tx, ty, bullet.x, bullet.y);
      graphics.lineStyle(2.6, bullet.color, 0.7);
      graphics.lineBetween(tx + (bullet.x - tx) * 0.35, ty + (bullet.y - ty) * 0.35, bullet.x, bullet.y);
      graphics.lineStyle(1.15, 0xfff5da, 0.92);
      graphics.lineBetween(tx + (bullet.x - tx) * 0.6, ty + (bullet.y - ty) * 0.6, bullet.x, bullet.y);
    }
    for (let i = this.combatVisuals.length - 1; i >= 0; i--) {
      const fx = this.combatVisuals[i];
      fx.ms -= ms;
      if (fx.ms <= 0) { this.combatVisuals.splice(i, 1); continue; }
      const f = fx.ms / fx.maxMs;
      if (fx.kind === 'ring') {
        graphics.lineStyle(5, fx.color, 0.13 * f);
        graphics.strokeCircle(fx.x, fx.y, fx.size * (1.3 - f * 0.38));
        graphics.lineStyle(2, fx.color, 0.8 * f);
        graphics.strokeCircle(fx.x, fx.y, fx.size * (1.1 - f * 0.65));
      } else if (fx.kind === 'beam') {
        // Broken electrical discharge, never a smooth solid "laser line".
        const dx = fx.x2 - fx.x, dy = fx.y2 - fx.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / len, ny = dx / len;
        let px = fx.x, py = fx.y;
        for (let j = 1; j <= 7; j++) {
          const k = j / 7;
          const shake = (j === 7 ? 0 : Math.sin((j * 21.7 + this.timeMs / 47 + fx.x) * 2.3) * 12 * f);
          const x = fx.x + dx * k + nx * shake;
          const y = fx.y + dy * k + ny * shake;
          graphics.lineStyle(8, fx.color, 0.13 * f);
          graphics.lineBetween(px, py, x, y);
          graphics.lineStyle(3, fx.color, 0.78 * f);
          graphics.lineBetween(px, py, x, y);
          graphics.lineStyle(1, 0xf8faff, 0.9 * f);
          graphics.lineBetween(px, py, x, y);
          px = x; py = y;
        }
      } else {
        // Two layers of short-lived translucent flame / buckshot pressure cones.
        const angle = fx.angle;
        const halfWidth = fx.size;
        const length = Math.hypot(fx.x2 - fx.x, fx.y2 - fx.y) * (1.05 - 0.16 * f);
        const left = angle + halfWidth, right = angle - halfWidth;
        const lx = fx.x + Math.cos(left) * length, ly = fx.y + Math.sin(left) * length;
        const rx = fx.x + Math.cos(right) * length, ry = fx.y + Math.sin(right) * length;
        graphics.fillStyle(fx.color, 0.16 * f);
        graphics.fillTriangle(fx.x, fx.y, lx, ly, rx, ry);
        graphics.lineStyle(3, fx.color, 0.33 * f);
        graphics.lineBetween(fx.x, fx.y, lx, ly);
        graphics.lineBetween(fx.x, fx.y, rx, ry);
        const inner = length * 0.56;
        graphics.lineStyle(5, 0xffefd4, 0.37 * f);
        graphics.lineBetween(fx.x, fx.y, fx.x + Math.cos(angle) * inner, fx.y + Math.sin(angle) * inner);
      }
    }
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const flash = this.muzzleFlashes[i];
      flash.ms -= ms;
      if (flash.ms <= 0) {
        flash.sprite.destroy();
        this.muzzleFlashes.splice(i, 1);
      } else {
        flash.sprite.setAlpha(flash.ms / flash.maxMs);
      }
    }
  }

  private updateWeapons(ms: number): void {
    for (const id of this.build.weapons) {
      this.weaponCooldowns[id] = Math.max(0, this.weaponCooldowns[id] - ms);
      const tuning = weaponTuning(this.growth, id);
      const range = (id === 'flame' ? 190 : id === 'scatter' ? 270 : id === 'arc' ? 320 : GAMEPLAY.fireRange)
        * this.build.range * tuning.range;
      const target = id === 'rifle' && this.lockedTarget?.alive
        && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.lockedTarget.x, this.lockedTarget.y) <= range
          ? this.lockedTarget
          : selectTarget(this.player, this.readableEnemies(), range);
      if (!target || this.weaponCooldowns[id] > 0) continue;
      const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      switch (id) {
        case 'rifle': {
          this.fire(angle, this.weaponDamage(GAMEPLAY.bulletDamage * tuning.damage),
            this.build.pierce + tuning.pierce, this.growth.evolved.rifle ? 1.65 : 1,
            this.growth.evolved.rifle ? 0xffd7a2 : WEAPON_LIGHT.rifle);
          break;
        }
        case 'scatter': this.fireScatter(angle); break;
        case 'arc': this.fireArc(target); break;
        case 'flame': this.fireFlame(angle); break;
      }
      const interval = id === 'rifle' ? fireIntervalMs(false) : id === 'scatter' ? 850 : id === 'arc' ? 980 : 170;
      this.weaponCooldowns[id] = this.weaponInterval(interval) * tuning.interval;
    }
  }

  private fire(
    angle: number, damage: number, pierce: number, scale = 1,
    tint = WEAPON_LIGHT.rifle, source: WeaponId = 'rifle', feedback = true,
  ): void {
    const muzzle = this.muzzlePoints[source];
    const muzzleX = muzzle.x, muzzleY = muzzle.y;
    const tier = visualPowerTier(this.build);
    const bullet = this.add.image(muzzleX, muzzleY, 'bolt')
      .setRotation(angle).setDepth(9).setScale(scale * (1 + tier * 0.06)).setTint(tint);
    if (this.deployed) bullet.setScale(scale * 1.12 * (1 + tier * 0.06));
    this.bullets.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(angle) * GAMEPLAY.projectileSpeed,
      vy: Math.sin(angle) * GAMEPLAY.projectileSpeed,
      damage, pierce, hitEnemies: new Set<Enemy>(), frost: this.build.frost,
      color: tint, remainingMs: GAMEPLAY.projectileLifetimeMs, sprite: bullet,
    });
    if (feedback) {
      this.burstMuzzle(source, angle);
      this.spawnSparks(muzzleX, muzzleY, 2 + tier, tint, 100);
    }
  }

  private fireScatter(angle: number): void {
    this.burstMuzzle('scatter', angle, 1.55);
    // Weapon Lv.3/5 increases actual pellet count; evolved shotgun adds knockback.
    const tuning = weaponTuning(this.growth, 'scatter');
    const center = (tuning.pellets - 1) / 2;
    for (let i = 0; i < tuning.pellets; i++) {
      const spread = (i - center) * 0.112;
      this.fire(angle + spread, this.weaponDamage(19 * tuning.damage),
        this.build.pierce, 0.8, WEAPON_LIGHT.scatter, 'scatter', false);
    }
    this.spawnSparks(this.muzzlePoints.scatter.x, this.muzzlePoints.scatter.y,
      12, 0xffd08a, 200);
    this.cameras.main.shake(47, 0.00125);
  }

  private fireArc(first: Enemy): void {
    const origin = this.muzzlePoints.arc;
    const angle = Math.atan2(first.y - origin.y, first.x - origin.x);
    this.burstMuzzle('arc', angle, 0.8);
    const chained = new Set<Enemy>();
    let current: Enemy | null = first;
    let fromX = origin.x, fromY = origin.y;
    const tuning = weaponTuning(this.growth, 'arc');
    for (let i = 0; i < tuning.chains && current; i++) {
      const enemy: Enemy = current;
      chained.add(enemy);
      this.addCombatVisual('beam', fromX, fromY, enemy.x, enemy.y,
        WEAPON_LIGHT.arc, 1, 125);
      this.damageEnemy(enemy, this.weaponDamage((i === 0 ? 38 : 25) * tuning.damage));
      if (this.build.frost || tuning.shockMs > 0) {
        enemy.slowMs = Math.max(enemy.slowMs, tuning.shockMs || 1000);
      }
      this.spawnSparks(enemy.x, enemy.y, 6, 0x9bcbff, 130);
      fromX = enemy.x; fromY = enemy.y;
      const nearby: Enemy[] = this.enemyList.filter(e => e.alive && !chained.has(e) &&
        Math.hypot(e.x - enemy.x, e.y - enemy.y) < tuning.chainRange * this.build.range);
      current = nearby.sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) -
        Math.hypot(b.x - enemy.x, b.y - enemy.y))[0] ?? null;
    }
  }

  private fireFlame(angle: number): void {
    const tuning = weaponTuning(this.growth, 'flame');
    const range = 190 * this.build.range * tuning.range;
    const cosThreshold = Math.cos(Math.min(1.2, tuning.coneHalfAngle * this.build.range));
    let hits = 0;
    for (const enemy of [...this.enemyList]) {
      if (!enemy.alive) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const len = Math.hypot(dx, dy);
      if (len > range || len <= 0 || (dx * Math.cos(angle) + dy * Math.sin(angle)) / len < cosThreshold) continue;
      this.damageEnemy(enemy, this.weaponDamage(9 * tuning.damage));
      if (!enemy.alive) { hits++; continue; }
      if (tuning.burnDurationMs > 0) {
        // Sustained burning refreshes duration, never multiplies the number of
        // per-enemy damage timers. DoT ticks in the existing enemy update loop.
        if (enemy.burnMs <= 0) enemy.burnTickMs = 250;
        enemy.burnMs = tuning.burnDurationMs;
        enemy.burnDamage = this.weaponDamage(tuning.burnTickDamage);
      }
      if (this.build.frost) enemy.slowMs = 1000;
      hits++;
    }
    const x = this.muzzlePoints.flame.x + Math.cos(angle) * 70;
    const y = this.muzzlePoints.flame.y + Math.sin(angle) * 70;
    this.burstMuzzle('flame', angle, 1.25);
    this.spawnSparks(x, y, Math.min(9, hits + 4), 0xff8c4e, 190);
    this.addCombatVisual('ring', x, y, x, y, 0xf36c45, 14 + hits * 2, 160);
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
          if (bullet.color === WEAPON_LIGHT.scatter && this.growth.evolved.scatter && enemy.alive) {
            const knock = weaponTuning(this.growth, 'scatter').knockback;
            const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            enemy.x = Phaser.Math.Clamp(enemy.x + knock * dx / dist, 48, WORLD - 48);
            enemy.y = Phaser.Math.Clamp(enemy.y + knock * dy / dist, 48, WORLD - 48);
          }
          this.addCombatVisual('ring', enemy.x, enemy.y, enemy.x, enemy.y, bullet.color, 12, 90);
          this.spawnSparks(enemy.x, enemy.y, 4 + visualPowerTier(this.build), bullet.color, 165);
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
    const critical = this.build.criticalChance > 0 && this.randoms.combat.next() < this.build.criticalChance;
    enemy.hp -= critical ? damage * 2 : damage;
    if (critical) {
      this.addCombatVisual('ring', enemy.x, enemy.y, enemy.x, enemy.y, 0xffe38b, 24, 125);
      this.spawnSparks(enemy.x, enemy.y, 8, 0xffed92, 200);
    }
    if (enemy.hp > 0) {
      enemy.flashTime = 78;
      enemy.sprite.setTint(0xf5fff6);
      return;
    }
    enemy.alive = false;
    enemy.sprite.destroy();
    enemy.shadow.destroy();
    enemy.warning?.destroy();
    enemy.eliteAura?.destroy();
    if (enemy.elite) this.spawnSupply(enemy.x, enemy.y);
    this.stampSplat(enemy.x, enemy.y, enemy.kind);
    this.addCombatVisual('ring', enemy.x, enemy.y, enemy.x, enemy.y,
      enemy.elite || enemy.kind === 'boss' ? 0xffd99d : HIVE_GORE[enemy.kind],
      enemy.kind === 'boss' ? 90 : enemy.elite ? 49 : 26, 220);
    this.spawnSparks(enemy.x, enemy.y, enemy.kind === 'boss' ? 35 : enemy.elite ? 20 : 10,
      HIVE_GORE[enemy.kind], enemy.kind === 'boss' ? 310 : 220);
    if (enemy.elite || enemy.kind === 'boss') {
      this.hitStopMs = Math.max(this.hitStopMs, enemy.kind === 'boss' ? 52 : 32);
      this.cameras.main.shake(enemy.kind === 'boss' ? 180 : 90, enemy.kind === 'boss' ? 0.005 : 0.002);
    }
    this.registerKill(enemy.kind, enemy.elite);
    if (this.kills % 3 === 0) this.soundFx.kill();
    if (this.lockedTarget === enemy) this.lockedTarget = null;
    const index = this.enemyList.indexOf(enemy);
    if (index >= 0) this.enemyList.splice(index, 1);
    if (enemy.kind === 'boss') this.bossKilled = true;
    if (this.build.explosionChance > 0 && this.randoms.combat.next() < this.build.explosionChance) {
      // One-depth explosion (no recursive chain reaction): bounded damage and frame cost.
      for (const other of [...this.enemyList]) {
        if (!other.alive || Math.hypot(enemy.x - other.x, enemy.y - other.y) > 100 * this.build.range) continue;
        other.hp -= this.weaponDamage(35);
        other.flashTime = 85;
        other.sprite.setTint(0xffd19b);
        if (other.hp <= 0) {
          // Explosive kills cannot trigger additional explosions.
          other.alive = false;
          other.sprite.destroy(); other.shadow.destroy(); other.warning?.destroy(); other.eliteAura?.destroy();
          if (other.elite) this.spawnSupply(other.x, other.y);
          this.enemyList.splice(this.enemyList.indexOf(other), 1);
          if (other.kind === 'boss') this.bossKilled = true;
          this.registerKill(other.kind, other.elite);
          this.stampSplat(other.x, other.y, other.kind);
          this.spawnSparks(other.x, other.y, 5, HIVE_GORE[other.kind], 180);
        }
      }
      this.addCombatVisual('ring', enemy.x, enemy.y, enemy.x, enemy.y, 0xffb26e, 100 * this.build.range, 260);
      this.spawnSparks(enemy.x, enemy.y, 13, 0xffad62, 220);
    }
  }

  /** Elite kills drop supplies; periodic drops also reward moving around the arena. */
  private spawnSupplyNearPlayer(): void {
    const angle = this.randoms.combat.next() * Math.PI * 2;
    const radius = 145 + this.randoms.combat.next() * 90;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, 65, WORLD - 65);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, 65, WORLD - 65);
    this.spawnSupply(x, y);
  }

  private spawnSupply(x: number, y: number): void {
    if (this.supplies.length >= MAX_SUPPLIES) return;
    const kind = rollSupplyKind(this.hp < this.build.maxHp, () => this.randoms.combat.next());
    const color = kind === 'repair' ? 0x77f5a9 : kind === 'overclock' ? 0xffd073 : 0x88baff;
    const glow = this.add.circle(x, y, 30, color, 0.10).setStrokeStyle(2, color, 0.65).setDepth(2);
    const sprite = this.add.image(x, y, 'supply').setTint(color).setDepth(4);
    this.supplies.push({ x, y, kind, remainingMs: SUPPLY_TTL_MS, sprite, glow });
    this.spawnSparks(x, y, 5, color, 85);
  }

  private updateSupplies(ms: number): void {
    for (let i = this.supplies.length - 1; i >= 0; i--) {
      const item = this.supplies[i];
      item.remainingMs -= ms;
      const dx = item.x - this.player.x;
      const dy = item.y - this.player.y;
      if (withinPickupReach(dx * dx + dy * dy, this.build.supplyMagnet)) {
        this.supplies.splice(i, 1);
        item.glow.destroy();
        item.sprite.destroy();
        this.activateSupply(item.kind);
      } else if (item.remainingMs <= 0) {
        this.supplies.splice(i, 1);
        item.glow.destroy();
        item.sprite.destroy();
      } else {
        const fade = Math.min(1, item.remainingMs / 2400);
        item.glow.setAlpha((0.55 + Math.sin(this.timeMs / 250) * 0.25) * fade);
        item.sprite.setAlpha(fade);
        item.sprite.setRotation(this.timeMs / 1800);
      }
    }
  }

  private activateSupply(kind: SupplyKind): void {
    this.suppliesCollected++;
    let message = '';
    let color = 0xffffff;
    if (kind === 'repair') {
      this.hp = Math.min(this.build.maxHp, this.hp + 2);
      this.build.hp = this.hp;
      message = '装甲修复 +2';
      color = 0x79ffd0;
    } else if (kind === 'overclock') {
      this.overclockMs = Math.max(this.overclockMs, overclockDurationMs(this.build.surgeCell));
      message = '超频加速 · 射速 +45%';
      color = 0xffda79;
    } else {
      const stats = empStats(this.build.empArray);
      const pulse = this.add.circle(this.player.x, this.player.y, stats.radius, 0x8aafff, 0.12)
        .setStrokeStyle(4, 0xa6cbff, 0.8).setDepth(4).setScale(0.4);
      this.tweens.add({
        targets: pulse, scaleX: 1, scaleY: 1, alpha: 0,
        duration: 320, onComplete: () => pulse.destroy(),
      });
      // Snapshot avoids iterator invalidation when EMP triggers weapon explosions.
      for (const enemy of [...this.enemyList]) {
        if (!enemy.alive || Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > stats.radius) continue;
        enemy.slowMs = Math.max(enemy.slowMs, 1500);
        this.damageEnemy(enemy, stats.damage);
      }
      message = 'EMP 脉冲 · 虫群瘫痪';
      color = 0x9cbcff;
    }
    this.spawnSparks(this.player.x, this.player.y, 12, color, 170);
    this.introHint.setText(message).setAlpha(1);
    this.introFadeMs = 1600;
    this.soundFx.deploy();
  }

  private registerKill(kind: EnemyKind, elite: boolean): void {
    this.kills++;
    const reward = grantExperience(this.growth, killExperience(kind, elite));
    this.growth = reward.state;
    if (reward.gainedLevels > 0) {
      const result = applyAutomaticLevels(this.build, this.growth, reward.gainedLevels, this.training);
      const text = summarizeGrowth(result, this.growth);
      if (text) {
        this.growthNotice = text;
        this.growthNoticeMs = result.evolutions.length ? 2000 : 1050;
      }
      if (result.evolutions.length) this.spawnSparks(this.player.x, this.player.y, 19, 0xffc67a, 170);
    }
    this.streak = advanceStreak(this.streak, this.lastKillMs, this.timeMs);
    this.lastKillMs = this.timeMs;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (this.streak === 5 || this.streak === 10 || this.streak === 20) {
      this.spawnSparks(this.player.x, this.player.y, 13, 0xffd075, 180);
      this.introHint.setText(`${this.streak} 连杀 · 火力增幅！`).setAlpha(1);
      this.introFadeMs = 1500;
    }
    if (this.build.salvage && ++this.salvageKills >= 20) {
      this.salvageKills = 0;
      if (this.hp < this.build.maxHp) {
        this.hp++;
        this.build.hp = this.hp;
        this.spawnSparks(this.player.x, this.player.y, 9, 0x75ffe0, 155);
      }
    }
  }

  private spawnSparks(x: number, y: number, count: number, color: number, speed: number): void {
    // A bounded particle budget keeps phones responsive during bursts of kills.
    for (let i = 0; i < count && this.particles.length < 105; i++) {
      const angle = this.randoms.visuals.next() * Math.PI * 2;
      const velocity = speed * (0.5 + this.randoms.visuals.next() * 0.65);
      const lifeMs = 120 + this.randoms.visuals.next() * 210;
      const sprite = this.add.circle(x, y, 1.7 + this.randoms.visuals.next() * 2, color, 0.92).setDepth(11);
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
    this.spawnSparks(this.player.x, this.player.y, 16, FACTION_COLORS.command, 155);
    this.cameras.main.shake(75, 0.0015);
  }

  private hurt(amount = 1): void {
    this.lastHurtMs = this.timeMs;
    this.streak = 0; // losing armor also breaks the combo, even if Bulwark absorbs it
    if (this.deployed && this.build.bulwark && this.randoms.combat.next() < 0.4) {
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
      cards: [...this.build.selected], bestStreak: this.bestStreak,
      level: this.growth.level, weaponLevels: { ...this.growth.weaponLevels },
      evolutions: Object.entries(this.growth.evolved).filter(([, enabled]) => enabled).map(([name]) => name),
      heroId: this.heroId, campaignId: this.campaignRun.campaignId, runSeed: this.campaignRun.seed,
    };
    window.dispatchEvent(new CustomEvent<RunResult>('swarm:gameover', { detail: result }));
  }

  private updateHUD(): void {
    this.clockLabel.setText(formatTime(this.timeMs / 1000));
    this.xpLabel.setText(this.growth.level === MAX_RUN_LEVEL
      ? 'LV.MAX / 完全同步'
      : `LV.${this.growth.level}  |  ${this.growth.xp}/${xpToNext(this.growth.level)} XP`);
    const combo = this.streak >= 5
      ? ` · ${this.streak}连杀 ×${streakDamageMultiplier(this.streak, this.build.frenzy).toFixed(2)}`
      : this.streak >= 2 ? ` · ${this.streak}连杀` : '';
    this.killLabel.setText(`击杀 ${String(this.kills).padStart(3, '0')}${combo}`);
    this.growthLabel.setText(this.growthNoticeMs > 0 ? this.growthNotice : `专精 ${this.training.weapon === 'rifle' ? '步枪' : this.training.weapon === 'scatter' ? '散射' : this.training.weapon === 'arc' ? '电弧' : '喷焰'} · ${TRAINING_LABELS[this.training.focus]}`);
    this.growthLabel.setAlpha(this.growthNoticeMs > 0 ? Math.min(1, this.growthNoticeMs / 350) : 0.72);
    const wave = this.currentStage.encounter.wave;
    const remaining = Math.max(0, Math.ceil((wave.durationMs - this.waveElapsedMs) / 1000));
    this.waveLabel.setText(this.currentStage.encounter.kind === 'boss'
      ? `${this.currentStage.actTitle} · ${this.bossKilled ? '虫巢已消灭' : `首领决战 ${remaining}s`}`
      : `${this.currentStage.actTitle} · ${this.waveNumber}/${this.currentStage.total} · ${remaining}s`);
    this.stateLabel.setText(this.deployed ? `火力展开 // ${this.build.weapons.length} 门齐射` : `机动射击 // ${this.build.weapons.length} 门武装`);
    this.stateLabel.setColor(this.deployed ? '#ffcd86' : '#c1f7e7');
    this.buffLabel.setFontSize(12);
    this.buffLabel.setText(`${buildReadout(this.build)}  · ${this.build.selected.length}张卡`);
    const loadout = visibleLoadout(this.build.weapons).map(id =>
      `${id === 'rifle' ? '步枪' : id === 'scatter' ? '肩炮' : id === 'arc' ? '电弧' : '喷焰'}${this.growth.weaponLevels[id]}${this.growth.evolved[id] ? '★' : ''}`
    ).join(' / ');
    this.modeHint.setText(this.overclockMs > 0
      ? `超频射击 +45% · 剩余 ${Math.ceil(this.overclockMs / 1000)} 秒`
      : this.deployed
        ? this.build.overload && this.overloadMs < 3000 ? '超载生效 · 额外射速 +40%' : '火力展开 · 伤害 +35% 射速 +25%'
        : this.stillMs > 0 ? '停止移动以展开火力' : `${loadout} · T${visualPowerTier(this.build)}火力`);

    const g = this.hudGraphics;
    g.clear();
    // XP bar lives below the existing wave / boss bar and never overlaps armor.
    const xpProgress = this.growth.level === MAX_RUN_LEVEL ? 1 : this.growth.xp / xpToNext(this.growth.level);
    g.fillStyle(0x102833, 0.9); g.fillRoundedRect(30, 163, VIEW_W - 60, 6, 2);
    g.fillStyle(0x78e8d0, 0.98); g.fillRoundedRect(30, 163, (VIEW_W - 60) * xpProgress, 6, 2);
    g.fillStyle(0x07151d, 0.93);
    g.fillRoundedRect(13, 12, VIEW_W - 26, 72, 4);
    g.fillStyle(0x273c45, 0.95);
    g.fillRect(13, 12, VIEW_W - 26, 3);
    g.lineStyle(1, 0x627d7a, 0.65);
    g.strokeRoundedRect(13, 12, VIEW_W - 26, 72, 4);
    g.fillStyle(0xf7a761, 0.9); g.fillRect(13, 12, 39, 3);
    g.fillStyle(0x75ccc1, 0.65); g.fillRect(56, 12, 14, 3);
    g.lineStyle(1, 0x48646b, 0.65);
    g.lineBetween(240, 21, 240, 74);
    g.fillStyle(0xf6ad6c, 0.75); g.fillTriangle(VIEW_W - 22, 12, VIEW_W - 13, 12, VIEW_W - 13, 21);
    for (let i = 0; i < this.build.maxHp; i++) {
      const x = 30 + i * Math.min(25, 200 / this.build.maxHp);
      g.fillStyle(i < this.hp ? 0x8ce3c8 : 0x27343d, 1);
      g.fillRoundedRect(x, 53, 19, 9, 1);
      if (i < this.hp) { g.fillStyle(0xe5fcdf, 0.55); g.fillRect(x + 2, 54, 15, 2); }
    }
    // Explicit progress towards deployment; turns letting go into an intentional decision.
    const progress = Phaser.Math.Clamp(this.stillMs / (GAMEPLAY.deployDelayMs * this.build.deployDelay), 0, 1);
    g.fillStyle(0x06151f, 0.78);
    g.fillRoundedRect(112, this.hudHeight - 83, VIEW_W - 224, 15, 7);
    g.fillStyle(this.deployed ? 0xffc077 : 0x62ebd0, 0.95);
    g.fillRoundedRect(115, this.hudHeight - 80, (VIEW_W - 230) * progress, 9, 4);
    g.lineStyle(1, 0x72989b, 0.5);
    g.strokeRoundedRect(112, this.hudHeight - 83, VIEW_W - 224, 15, 7);
    // Military orange threat rail; each segment corresponds to one wave.
    for (let i = 0; i < this.currentStage.total; i++) {
      const segment = 195 / this.currentStage.total;
      g.fillStyle(i < this.waveNumber ? 0xea9c63 : 0x34454c, i < this.waveNumber ? 0.95 : 0.65);
      g.fillRect(129 + i * segment, 117, segment - 8, 3);
    }
    if (this.currentStage.encounter.kind === 'boss' && this.bossSpawned && !this.bossKilled) {
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
    this.enemyList.forEach((e) => { e.sprite.destroy(); e.shadow.destroy(); e.warning?.destroy(); e.eliteAura?.destroy(); });
    this.arrivingEnemies.forEach(enemy => enemy.marker.destroy());
    this.arrivingEnemies = [];
    this.supplies.forEach(item => { item.sprite.destroy(); item.glow.destroy(); });
    this.supplies = [];
    this.enemyList = [];
    this.targetGraceMs = 0;
    this.bullets.forEach((b) => b.sprite.destroy());
    this.bullets = [];
    this.acids.forEach(a => a.sprite.destroy());
    this.acids = [];
    this.particles.forEach((p) => p.sprite.destroy());
    this.particles = [];
    for (const flash of this.muzzleFlashes) flash.sprite.destroy();
    this.muzzleFlashes = [];
    this.combatVisuals = [];
    this.combatGraphics?.clear();
    this.crosshair?.setVisible(false);
    this.targetingLine?.clear();
  }
}
