/**
 * Cocos Creator 3.8 migration PoC: attach this component to the 2D scene Canvas.
 * Primitive Graphics are intentional debug art. No DOM, Phaser or wx API.
 * Requires an editor-created scene; see clients/cocos/README.md.
 */
import {
  _decorator, Component, Color, Graphics, Label, Node, UITransform,
  EventTouch, EventKeyboard, Input, KeyCode, input, game, Game, view,
} from 'cc';
import { PocWorld, normalizedMove, type Vec2 } from './PocWorld';
import { type PocHeroId } from './PocRoster.ts';
import type { CampaignMode } from './m6/runController.ts';
import { TRAINING_LABELS, type TrainingFocus } from './m6/autoGrowth.ts';
import type { WeaponId } from './m6/progression.ts';
import { mobileViewport, type MobileViewport } from './PocViewport.ts';
import {
  readRunSafeSave, writeRunSafeSave, type SafeRunStorage,
} from './m6/runSafeSave.ts';
import { getStoragePort } from './m6/platformStorage.ts';
import { preservePreviousCheckpoint } from './m6/safeNodePolicy.ts';
import { CreatorHangar, type WorkshopItem } from './PocHangar.ts';

// Creator's preview and the original Phaser H5 must NEVER share save keys.
const creatorStoragePrefix = 'cocos-creator-m6:';
const creatorSafeStorage: SafeRunStorage = {
  getItem(key: string): string | null {
    return getStoragePort()?.getItem(creatorStoragePrefix + key) ?? null;
  },
  setItem(key: string, value: string): void {
    const port = getStoragePort();
    if (!port) throw new Error('No Cocos storage adapter configured');
    port.setItem(creatorStoragePrefix + key, value);
  },
  removeItem(key: string): void {
    const port = getStoragePort();
    if (!port) throw new Error('No Cocos storage adapter configured');
    port.removeItem(creatorStoragePrefix + key);
  },
};

const { ccclass } = _decorator;
const COL = {
  floor: new Color(12, 27, 37, 255),
  grid: new Color(34, 67, 75, 100),
  outline: new Color(15, 23, 32, 255),
  shadow: new Color(3, 8, 15, 160),
  marine: new Color(100, 195, 195, 255),
  chest: new Color(59, 117, 150, 255),
  rifle: new Color(255, 195, 120, 255),
  deployed: new Color(255, 194, 105, 180),
  enemy: new Color(156, 72, 94, 255),
  claw: new Color(222, 172, 126, 255),
  bullet: new Color(255, 222, 131, 255),
  stick: new Color(123, 219, 203, 120),
};

@ccclass('PocBattle')
export class PocBattle extends Component {
  private world!: PocWorld;
  private selectedHero: PocHeroId = 'marine';
  private selectedMode: CampaignMode = 'prototype';
  private readonly hangar = new CreatorHangar();
  private hangarLabels: Label[] = [];
  private lastSavedFingerprint = '';
  private storageWarning = false;
  private graphic!: Graphics;
  private uiGraphic!: Graphics;
  private viewport!: MobileViewport;
  private hud!: Label;
  private optionLabels: Label[] = [];
  private trainingLabels: Label[] = [];
  private activeTouch: number | null = null;
  private touchOrigin: Vec2 = { x: 0, y: 0 };
  private touchMove: Vec2 = { x: 0, y: 0 };
  private pressed = new Set<KeyCode>();
  private suspended = false;
  private screenWidth = 450;
  private screenHeight = 800;

  onLoad(): void {
    const size = view.getVisibleSize();
    this.screenWidth = size.width;
    this.screenHeight = size.height;
    this.viewport = mobileViewport(size.width, size.height);
    this.world = this.hangar.launch(this.viewport.worldWidth, this.viewport.worldHeight,
      this.selectedHero, this.selectedMode);
    // M5.3: combat geometry is independently scaled to the 600-unit world.
    // HUD, safe-node cards and touch joystick stay in Canvas UI coordinates.
    const worldNode = new Node('BattleWorldGraphics');
    this.node.addChild(worldNode);
    worldNode.addComponent(UITransform).setContentSize(
      this.viewport.worldWidth, this.viewport.worldHeight);
    worldNode.setScale(this.viewport.worldScale, this.viewport.worldScale, 1);
    this.graphic = worldNode.addComponent(Graphics);
    const uiNode = new Node('BattleUIOverlay');
    this.node.addChild(uiNode);
    uiNode.addComponent(UITransform).setContentSize(size.width, size.height);
    this.uiGraphic = uiNode.addComponent(Graphics);
    const hudNode = new Node('PocHUD');
    this.node.addChild(hudNode);
    hudNode.addComponent(UITransform).setContentSize(size.width - 20, 90);
    this.hud = hudNode.addComponent(Label);
    this.hud.fontSize = Math.max(12, 16 * this.viewport.hudScale);
    this.hud.lineHeight = Math.max(17, 23 * this.viewport.hudScale);
    hudNode.setPosition(0, size.height / 2 - 58, 0);
    // Three genuine Creator UI Labels, not browser DOM nodes.
    for (let index = 0; index < 3; index++) {
      const labelNode = new Node('DecisionCardLabel' + index);
      this.node.addChild(labelNode);
      labelNode.addComponent(UITransform).setContentSize(Math.max(76, size.width / 3 - 28), 115);
      const label = labelNode.addComponent(Label);
      label.fontSize = 14;
      label.lineHeight = 20;
      label.enableWrapText = true;
      label.overflow = Label.Overflow.SHRINK;
      labelNode.active = false;
      this.optionLabels.push(label);
    }
    // Four equipped-weapon choices + three focus choices, independent of world zoom.
    for (let index = 0; index < 7; index++) {
      const node = new Node('SafeTrainingChoice' + index);
      this.node.addChild(node);
      node.addComponent(UITransform).setContentSize(112, 34);
      const label = node.addComponent(Label);
      label.fontSize = Math.max(11, 12 * this.viewport.hudScale);
      label.lineHeight = 18;
      label.enableWrapText = true;
      label.overflow = Label.Overflow.SHRINK;
      node.active = false;
      this.trainingLabels.push(label);
    }
    // M6.1a: permanent resource workshop and zone choice are genuine Creator UI.
    // They appear after defeat/victory, not as interrupting combat pop-ups.
    for (let index = 0; index < 6; index++) {
      const node = new Node('HangarButtonLabel' + index);
      this.node.addChild(node);
      node.addComponent(UITransform).setContentSize(
        Math.max(78, size.width / (index < 2 ? 2 : 3) - 15), 100);
      const label = node.addComponent(Label);
      label.fontSize = Math.max(11, 13 * this.viewport.hudScale);
      label.lineHeight = Math.max(15, 18 * this.viewport.hudScale);
      label.enableWrapText = true;
      label.overflow = Label.Overflow.SHRINK;
      node.active = false;
      this.hangarLabels.push(label);
    }
    // Staging-only smoke-test contract. Never expose storage or player identity.
    (globalThis as typeof globalThis & { __swarmCocosDebug?: { state: () => object } }).__swarmCocosDebug = {
      state: () => ({
        initialized: true,
        hero: this.world.heroId, signature: this.world.heroId === 'kane' ? 'kane-rail' : null,
        input: { touchActive: this.activeTouch !== null, touchMove: { ...this.touchMove },
          pressedKeys: this.pressed.size, suspended: this.suspended },
        x: this.world.state.player.x, y: this.world.state.player.y,
        worldWidth: this.world.width, worldHeight: this.world.height,
        screenWidth: this.screenWidth, screenHeight: this.screenHeight,
        worldScale: this.viewport.worldScale, hudScale: this.viewport.hudScale,
        hp: this.world.state.player.hp, enemies: this.world.state.enemies.length,
        kills: this.world.state.kills, wave: this.world.state.wave,
        level: this.world.state.level, over: this.world.state.over,
        mode: this.world.state.mode, totalStages: this.world.state.totalStages,
        zone: this.world.zoneId, nextZone: this.hangar.zoneId,
        metaRank: this.hangar.display().meta?.armorRank ?? null,
        decision: this.world.decision?.kind ?? null,
        training: { ...this.world.state.training },
        savedCheckpoint: readRunSafeSave(creatorSafeStorage)?.campaign.stageIndex ?? null,
      }),
    };
  }

  onEnable(): void {
    input.on(Input.EventType.TOUCH_START, this.touchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.touchDrag, this);
    input.on(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
    input.on(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.on(Input.EventType.KEY_UP, this.keyUp, this);
    game.on(Game.EVENT_HIDE, this.backgrounded, this);
    game.on(Game.EVENT_SHOW, this.foregrounded, this);
  }
  onDisable(): void {
    input.off(Input.EventType.TOUCH_START, this.touchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.touchDrag, this);
    input.off(Input.EventType.TOUCH_END, this.touchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.touchEnd, this);
    input.off(Input.EventType.KEY_DOWN, this.keyDown, this);
    input.off(Input.EventType.KEY_UP, this.keyUp, this);
    game.off(Game.EVENT_HIDE, this.backgrounded, this);
    game.off(Game.EVENT_SHOW, this.foregrounded, this);
    this.releaseInput();
    delete (globalThis as typeof globalThis & { __swarmCocosDebug?: object }).__swarmCocosDebug;
  }
  private releaseInput(): void {
    this.activeTouch = null;
    this.touchMove = { x: 0, y: 0 };
    this.pressed.clear();
    this.world?.discardFrameDebt();
  }
  private backgrounded(): void { this.suspended = true; this.releaseInput(); }
  private foregrounded(): void { this.suspended = false; this.releaseInput(); }

  private touchStart(event: EventTouch): void {
    if (this.activeTouch !== null) return;
    const p = event.getUILocation();
    if (this.world.state.over) { this.handleHangarTap(p); return; }
    const decision = this.world.decision;
    if (decision) {
      // Training is editable only while the safe-node reward UI is open.
      const owned = this.world.state.weapons;
      if (p.y >= 250 && p.y <= 290 && owned.length) {
        const index = Math.min(owned.length - 1, Math.floor(p.x / this.screenWidth * owned.length));
        if (this.world.setTraining(owned[index], this.world.state.training.focus))
          this.persistSafeNode();
        return;
      }
      if (p.y >= 306 && p.y <= 346) {
        const choices: readonly TrainingFocus[] = ['damage', 'rate', 'speed'];
        const index = Math.min(2, Math.floor(p.x / this.screenWidth * 3));
        if (this.world.setTraining(this.world.state.training.weapon, choices[index]))
          this.persistSafeNode();
        return;
      }
      const count = decision.options.length;
      const gap = 8, cardWidth = (this.screenWidth - 16 - gap * (count - 1)) / count;
      if (p.y >= 100 && p.y <= 228) {
        for (let index = 0; index < count; index++) {
          const left = 8 + index * (cardWidth + gap);
          if (p.x < left || p.x > left + cardWidth) continue;
          if (this.world.chooseDecision(index)) {
            this.persistSafeNode();
            this.releaseInput();
          }
          break;
        }
      }
      return; // combat input stays locked until an explicit safe-node decision
    }
    if (p.y > this.screenHeight * 0.65) {
      // Temporary migration controls: left switches 5-wave / 3-act, right hero.
      if (p.x < this.screenWidth * 0.36) this.switchMode();
      else if (p.x > this.screenWidth * 0.64) this.switchHero();
      else this.resumeSafeNode();
      return;
    } // thumb zone near screen bottom
    this.activeTouch = event.getID();
    this.touchOrigin = { x: p.x, y: p.y };
    this.touchMove = { x: 0, y: 0 };
  }
  private touchDrag(event: EventTouch): void {
    if (event.getID() !== this.activeTouch) return;
    const p = event.getUILocation();
    const dx = p.x - this.touchOrigin.x, dy = p.y - this.touchOrigin.y;
    const distance = Math.hypot(dx, dy);
    const magnitude = Math.max(0, Math.min(1, (distance - 8) / 49));
    this.touchMove = distance > 0
      ? { x: dx / distance * magnitude, y: dy / distance * magnitude }
      : { x: 0, y: 0 };
  }
  private touchEnd(event: EventTouch): void {
    if (event.getID() === this.activeTouch) {
      this.activeTouch = null;
      this.touchMove = { x: 0, y: 0 };
    }
  }
  private keyDown(event: EventKeyboard): void {
    this.pressed.add(event.keyCode);
    if (event.keyCode === KeyCode.KEY_H) this.switchHero();
    if (event.keyCode === KeyCode.KEY_M) this.switchMode();
    if (event.keyCode === KeyCode.KEY_R) {
      this.startFreshRun();
    }
  }
  private persistSafeNode(): void {
    const save = this.world.safeSnapshot();
    if (!save) return;
    if (preservePreviousCheckpoint(readRunSafeSave(creatorSafeStorage), save)) return;
    const signature = JSON.stringify({ ...save, savedAtMs: 0 });
    if (signature === this.lastSavedFingerprint) return;
    if (!writeRunSafeSave(creatorSafeStorage, save)) {
      this.storageWarning = true;
      return;
    }
    this.storageWarning = false;
    this.lastSavedFingerprint = signature;
  }
  private resumeSafeNode(): void {
    const restored = this.hangar.restore(this.viewport.worldWidth, this.viewport.worldHeight);
    if (!restored) return;
    this.world = restored;
    this.selectedHero = 'marine';
    this.selectedMode = 'expedition';
    this.lastSavedFingerprint = '';
    this.releaseInput();
  }

  private handleHangarTap(p: Vec2): void {
    const h = this.screenHeight, w = this.screenWidth;
    if (p.y >= h * .70 && p.y <= h * .815) {
      this.hangar.chooseZone(p.x < w / 2 ? 'steel-ruins' : 'infested-nest');
      return;
    }
    if (p.y >= h * .47 && p.y <= h * .60) {
      const options: readonly WorkshopItem[] = ['armor', 'weapon-frame', 'repair-module'];
      const index = Math.min(2, Math.max(0, Math.floor(p.x / w * 3)));
      this.hangar.purchase(options[index]);
      return;
    }
    if (p.y >= h * .16 && p.y <= h * .28) this.startFreshRun();
  }

  private startFreshRun(): void {
    // New run seed + ID: never reuse the completed run ledger key.
    this.hangar.settle(this.world);
    this.world = this.hangar.launch(this.viewport.worldWidth, this.viewport.worldHeight,
      this.selectedHero, this.selectedMode);
    this.lastSavedFingerprint = '';
    this.releaseInput();
  }

  private paintHangar(ui: Graphics): void {
    const s = this.world.state;
    for (const label of this.hangarLabels) label.node.active = s.over;
    if (!s.over) return;
    const display = this.hangar.display();
    const meta = display.meta;
    const w = this.screenWidth, h = this.screenHeight;
    const armor = display.armorCost;
    const frame = display.frameCost;
    const repair = display.repairCost;
    const captions = [
      '钢铁遗迹\n合金战区' + (display.zoneId === 'steel-ruins' ? ' ✓' : ''),
      '感染巢穴\n样本战区' + (display.zoneId === 'infested-nest' ? ' ✓' : ''),
      '装甲 Lv.' + (meta?.armorRank ?? 0) + '\n'
        + (armor === null ? '已满级' : armor + ' 战备'),
      '武器框架 Lv.' + (meta?.weaponFrameRank ?? 0) + '\n'
        + (frame === null ? '已满级' : frame.warData + '战备+' + frame.quantity + '合金'),
      '修复模块 Lv.' + (meta?.repairModuleRank ?? 0) + '\n'
        + (repair === null ? '已满级' : repair.warData + '战备+' + repair.quantity + '样本'),
      '启动下一局\n新购买装备生效',
    ];
    for (let i = 0; i < this.hangarLabels.length; i++) {
      const label = this.hangarLabels[i];
      const zone = i < 2, launch = i === 5;
      const count = zone ? 2 : launch ? 1 : 3;
      const index = zone ? i : launch ? 0 : i - 2;
      const slotWidth = w / count;
      const x = -w / 2 + slotWidth * index + 6;
      const y = -h / 2 + h * (zone ? .70 : launch ? .16 : .47);
      const rectHeight = h * (zone ? .115 : launch ? .12 : .13);
      const rectWidth = slotWidth - 12;
      const highlighted = zone && display.zoneId === (i === 0 ? 'steel-ruins' : 'infested-nest');
      ui.fillColor = highlighted ? new Color(48, 94, 78, 245) : new Color(22, 49, 59, 245);
      ui.rect(x, y, rectWidth, rectHeight); ui.fill();
      ui.strokeColor = highlighted ? new Color(255, 220, 146, 255)
        : new Color(111, 179, 178, 230);
      ui.lineWidth = 2; ui.rect(x, y, rectWidth, rectHeight); ui.stroke();
      label.node.setPosition(x + rectWidth / 2, y + rectHeight / 2, 0);
      label.string = captions[i];
    }
  }
  private switchHero(): void {
    this.selectedHero = this.selectedHero === 'marine' ? 'kane' : 'marine';
    this.startFreshRun();
  }
  private switchMode(): void {
    this.selectedMode = this.selectedMode === 'prototype' ? 'expedition' : 'prototype';
    this.startFreshRun();
  }
  private keyUp(event: EventKeyboard): void { this.pressed.delete(event.keyCode); }
  private intent(): Vec2 {
    const dx = this.touchMove.x
      + Number(this.pressed.has(KeyCode.KEY_D) || this.pressed.has(KeyCode.ARROW_RIGHT))
      - Number(this.pressed.has(KeyCode.KEY_A) || this.pressed.has(KeyCode.ARROW_LEFT));
    const dy = this.touchMove.y
      + Number(this.pressed.has(KeyCode.KEY_W) || this.pressed.has(KeyCode.ARROW_UP))
      - Number(this.pressed.has(KeyCode.KEY_S) || this.pressed.has(KeyCode.ARROW_DOWN));
    return normalizedMove(dx, dy);
  }
  update(dt: number): void {
    if (!this.world || !this.graphic) return;
    if (!this.suspended) {
      this.world.advance(dt * 1000, this.intent());
      this.persistSafeNode();
      // Failed runs receive rewards as well, exactly once per canonical runId.
      if (this.world.state.over) this.hangar.settle(this.world);
    }
    this.paint();
  }
  private paint(): void {
    const g = this.graphic;
    const ui = this.uiGraphic;
    const s = this.world.state;
    const w = this.world.width, h = this.world.height;
    g.clear();
    ui.clear();

    g.fillColor = COL.floor;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    g.strokeColor = COL.grid; g.lineWidth = 1;
    for (let x = -w / 2; x < w / 2; x += 55) { g.moveTo(x, -h / 2); g.lineTo(x, h / 2); g.stroke(); }
    for (let y = -h / 2; y < h / 2; y += 55) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.stroke(); }

    for (const enemy of s.enemies) {
      const scale = enemy.kind === 'boss' ? 2.3 : enemy.kind === 'armored' ? 1.35 : enemy.kind === 'leaper' ? .85 : 1;
      const radius = 18 * scale;
      g.fillColor = COL.shadow; g.ellipse(enemy.x, enemy.y - 12, radius + 4, 8 * scale); g.fill();
      g.fillColor = enemy.kind === 'boss' ? new Color(204, 92, 86, 255)
        : enemy.kind === 'armored' ? new Color(133, 103, 130, 255)
        : enemy.kind === 'spitter' ? new Color(156, 220, 113, 255)
        : enemy.kind === 'bomber' ? new Color(255, 78, 121, 255)
        : enemy.kind === 'leaper' ? new Color(180, 95, 107, 255)
        : COL.enemy;
      g.circle(enemy.x, enemy.y + 8 * scale, radius); g.fill();
      if (enemy.elite) {
        g.strokeColor = new Color(255, 204, 140, 245); g.lineWidth = 3;
        g.circle(enemy.x, enemy.y + 6, 28 * scale); g.stroke();
      }
      if ((enemy.windupMs ?? 0) > 0
        && (enemy.kind === 'leaper' || enemy.kind === 'spitter' || enemy.kind === 'boss')) {
        g.strokeColor = enemy.kind === 'spitter'
          ? new Color(173, 235, 123, 242) : new Color(255, 166, 119, 242);
        g.lineWidth = 2.5;
        g.circle(enemy.x, enemy.y, enemy.kind === 'boss' ? 65 : 26); g.stroke();
      }
      if (enemy.kind === 'bomber' && (enemy.windupMs ?? 0) > 0) {
        g.fillColor = new Color(255, 63, 102, 30);
        g.circle(enemy.x, enemy.y, 105); g.fill();
        g.strokeColor = new Color(255, 101, 133, 250); g.lineWidth = 3;
        g.circle(enemy.x, enemy.y, 105); g.stroke();
      }
      g.strokeColor = COL.claw; g.lineWidth = 3;
      g.moveTo(enemy.x - 12, enemy.y + 4); g.lineTo(enemy.x - 23, enemy.y - 8); g.stroke();
      g.moveTo(enemy.x + 12, enemy.y + 4); g.lineTo(enemy.x + 23, enemy.y - 8); g.stroke();
      if (enemy.kind === 'boss' || enemy.kind === 'armored') {
        g.fillColor = COL.shadow; g.rect(enemy.x - radius, enemy.y + radius + 11, radius * 2, 5); g.fill();
        g.fillColor = COL.claw;
        g.rect(enemy.x - radius, enemy.y + radius + 11,
          radius * 2 * Math.max(0, enemy.hp / (enemy.maxHp ?? 1)), 5); g.fill();
      }
    }
    for (const arrival of s.arrivals) {
      const fraction = 1 - arrival.remainingMs / arrival.durationMs;
      g.fillColor = new Color(255, 112, 83, 32);
      g.circle(arrival.x, arrival.y, 18 + fraction * 12); g.fill();
      g.strokeColor = arrival.elite ? new Color(255, 220, 153, 255)
        : new Color(255, 145, 104, 255);
      g.lineWidth = 2 + fraction;
      g.circle(arrival.x, arrival.y, 18 + fraction * 12); g.stroke();
    }
    for (const acid of s.acids) {
      g.fillColor = new Color(168, 244, 122, 245);
      g.circle(acid.x, acid.y + 8, 7); g.fill();
      g.strokeColor = new Color(234, 255, 192, 240); g.lineWidth = 2;
      g.circle(acid.x, acid.y + 8, 9); g.stroke();
    }
    for (const supply of s.supplies) {
      g.fillColor = supply.kind === 'repair' ? new Color(119, 245, 169, 255)
        : supply.kind === 'overclock' ? new Color(255, 208, 115, 255)
        : new Color(136, 186, 255, 255);
      g.circle(supply.x, supply.y + 8, 12); g.fill();
      g.strokeColor = new Color(238, 250, 246, 215); g.lineWidth = 2;
      g.circle(supply.x, supply.y + 8, 20); g.stroke();
    }
    for (const pulse of s.pulses) {
      g.strokeColor = pulse.kind === 'bomber'
        ? new Color(255, 86, 115, 235) : new Color(136, 186, 255, 235);
      g.lineWidth = 5 * Math.min(1, pulse.remainingMs / 140);
      g.circle(pulse.x, pulse.y, pulse.radius); g.stroke();
    }
    for (const arc of s.lightning) {
      const rail = arc.kind === 'rail', flame = arc.kind === 'flame';
      g.strokeColor = flame ? new Color(255, 133, 65, 238)
        : rail ? new Color(255, 203, 124, 250) : new Color(147, 224, 255, 240);
      g.lineWidth = flame ? 11 : rail ? 7 : 4;
      g.moveTo(arc.fromX, arc.fromY + 17);
      g.lineTo((arc.fromX + arc.toX) * .5 - (rail || flame ? 0 : 6),
        (arc.fromY + arc.toY) * .5 + (rail || flame ? 17 : 28));
      g.lineTo(arc.toX, arc.toY + 17);
      g.stroke();
    }
    for (const b of s.bullets) {
      g.fillColor = b.source === 'scatter' ? new Color(255, 146, 89, 255) : COL.bullet;
      g.circle(b.x, b.y + 8, b.source === 'scatter' ? 3 : 4); g.fill();
    }
    const p = s.player;
    g.fillColor = COL.shadow; g.ellipse(p.x, p.y - 14, 23, 9); g.fill();
    if (p.deployed) {
      g.strokeColor = COL.deployed; g.lineWidth = 3;
      g.ellipse(p.x, p.y - 8, 37, 16); g.stroke();
    }
    g.fillColor = COL.marine; g.rect(p.x - 13, p.y - 2, 26, 36); g.fill();
    g.fillColor = this.world.heroId === 'kane' ? new Color(220, 177, 109, 255) : COL.chest;
    g.rect(p.x - 10, p.y + 10, 20, 14); g.fill();
    g.fillColor = COL.marine; g.circle(p.x, p.y + 37, 10); g.fill();
    const target = s.enemies.reduce<typeof s.enemies[number] | null>((best, e) =>
      !best || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best, null);
    const heading = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    g.strokeColor = COL.rifle; g.lineWidth = 6;
    g.moveTo(p.x + 5, p.y + 18);
    g.lineTo(p.x + 5 + Math.cos(heading) * 31, p.y + 18 + Math.sin(heading) * 31);
    g.stroke();

    if (this.activeTouch !== null) {
      const x = this.touchOrigin.x - this.screenWidth / 2;
      const y = this.touchOrigin.y - this.screenHeight / 2;
      ui.strokeColor = COL.stick; ui.lineWidth = 2; ui.circle(x, y, 56); ui.stroke();
      ui.fillColor = COL.stick;
      ui.circle(x + this.touchMove.x * 40, y + this.touchMove.y * 40, 17); ui.fill();
    }
    const decision = this.world.decision;
    const count = decision?.options.length ?? 0;
    const gap = 8, cardWidth = count > 0
      ? (this.screenWidth - 16 - gap * (count - 1)) / count : 0;
    const cardHeight = 128, cardY = -this.screenHeight / 2 + 100;
    const owned = s.weapons;
    const labels: Record<WeaponId, string> = {
      rifle: '步枪', scatter: '散射炮', arc: '电弧', flame: '喷火',
    };
    for (let index = 0; index < this.trainingLabels.length; index++) {
      const label = this.trainingLabels[index];
      label.node.active = Boolean(decision) && (index < owned.length
        || (index >= 4 && index < 7));
      if (!label.node.active) continue;
      const weaponRow = index < 4;
      if (weaponRow && index >= owned.length) continue;
      const count = weaponRow ? owned.length : 3;
      const pos = weaponRow ? index : index - 4;
      const cellWidth = this.screenWidth / count;
      const x = -this.screenWidth / 2 + pos * cellWidth + 3;
      const y = -this.screenHeight / 2 + (weaponRow ? 250 : 306);
      const active = weaponRow ? owned[pos] === s.training.weapon
        : (['damage','rate','speed'] as const)[pos] === s.training.focus;
      ui.fillColor = active ? new Color(57, 97, 78, 235) : new Color(25, 46, 52, 235);
      ui.rect(x, y, cellWidth - 6, 40); ui.fill();
      ui.strokeColor = active ? new Color(242, 207, 131, 255)
        : new Color(91, 153, 151, 200);
      ui.lineWidth = 2; ui.rect(x, y, cellWidth - 6, 40); ui.stroke();
      label.node.setPosition(x + cellWidth / 2 - 3, y + 20, 0);
      label.string = weaponRow ? labels[owned[pos]]
        : TRAINING_LABELS[(['damage','rate','speed'] as const)[pos]];
    }
    for (let i = 0; i < this.optionLabels.length; i++) {
      const label = this.optionLabels[i];
      label.node.active = i < count;
      if (!decision || i >= count) continue;
      const x = -this.screenWidth / 2 + 8 + i * (cardWidth + gap);
      ui.fillColor = new Color(23, 47, 59, 238);
      ui.rect(x, cardY, cardWidth, cardHeight); ui.fill();
      ui.strokeColor = new Color(91, 193, 180, 230); ui.lineWidth = 2;
      ui.rect(x, cardY, cardWidth, cardHeight); ui.stroke();
      label.node.setPosition(x + cardWidth / 2, cardY + cardHeight / 2, 0);
      label.string = (i + 1) + '. ' + decision.options[i].name
        + '\n' + decision.options[i].description;
    }
    this.paintHangar(ui);
    this.hud.string = s.over
      ? (s.won ? '虫潮歼灭 · 远征结算' : '机甲损毁 · 战备结算')
        + ' · 击杀 ' + s.kills
        + '\\n' + this.hangar.message
        + '\\n战备 ' + (this.hangar.display().meta?.warData ?? '—')
        + ' · 合金 ' + (this.hangar.display().meta?.alloy ?? '—')
        + ' · 样本 ' + (this.hangar.display().meta?.samples ?? '—')
      : decision
        ? (decision.kind === 'card' ? '遭遇结束 · 选择战术卡' : '路线分岔 · 选择前进路线')
          + '\\n' + decision.options.map((option, index) => (index + 1) + '. ' + option.name).join('   ')
          + '\\n训练：' + s.training.weapon + '／' + TRAINING_LABELS[s.training.focus]
          + ' · 下方可更改专精后选卡'
        : '无尽虫潮 · ' + (s.mode === 'expedition' ? '三幕远征' : '五波封锁')
          + ' · ' + this.world.heroName + ' · ' + s.wave + '/' + s.totalStages + ' · Lv.' + s.level
          + '\\n装甲 ' + s.player.hp + '/' + s.player.maxHp + ' · 击杀 ' + s.kills
          + (s.streak >= 2 ? ' · ' + s.streak + '连杀' : '')
          + (s.suppliesCollected ? ' · 补给' + s.suppliesCollected : '')
          + ' · 专精' + s.training.weapon + '/' + TRAINING_LABELS[s.training.focus]
          + ' · ' + s.weapons.map(id => id + ' Lv.' + s.weaponLevels[id]
            + (s.evolved[id] ? ' ★' : '')).join('/')
          + ' · ' + (s.overclockMs > 0 ? '超频射击' :
            s.player.deployed ? '火力展开' : '机动射击')
          + (s.surgeWarningMs > 0 ? ' · ⚠虫潮集结 ' +
              (s.surgeWarningMs / 1000).toFixed(1) + '秒' : '')
          + (this.storageWarning ? ' · ⚠安全节点未保存' : '')
          + ' · 上方中间恢复远征 · 左侧切模式 / M · 右侧换英雄 / H';
  }
}
