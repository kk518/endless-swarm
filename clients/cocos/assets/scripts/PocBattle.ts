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
  private graphic!: Graphics;
  private hud!: Label;
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
    this.world = new PocWorld(size.width, size.height);
    this.graphic = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    const hudNode = new Node('PocHUD');
    this.node.addChild(hudNode);
    hudNode.addComponent(UITransform).setContentSize(size.width - 20, 90);
    this.hud = hudNode.addComponent(Label);
    this.hud.fontSize = 16;
    this.hud.lineHeight = 23;
    hudNode.setPosition(0, size.height / 2 - 58, 0);
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
    if (this.world.state.over) { this.world.reset(); return; }
    const p = event.getUILocation();
    if (p.y > this.screenHeight * 0.65) return; // thumb zone near screen bottom
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
    if (event.keyCode === KeyCode.KEY_R) {
      this.world.reset();
      this.releaseInput();
    }
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
    if (!this.suspended) this.world.advance(dt * 1000, this.intent());
    this.paint();
  }
  private paint(): void {
    const g = this.graphic;
    const s = this.world.state;
    const w = this.screenWidth, h = this.screenHeight;
    g.clear();

    g.fillColor = COL.floor;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    g.strokeColor = COL.grid; g.lineWidth = 1;
    for (let x = -w / 2; x < w / 2; x += 55) { g.moveTo(x, -h / 2); g.lineTo(x, h / 2); g.stroke(); }
    for (let y = -h / 2; y < h / 2; y += 55) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.stroke(); }

    for (const enemy of s.enemies) {
      g.fillColor = COL.shadow; g.ellipse(enemy.x, enemy.y - 12, 20, 8); g.fill();
      g.fillColor = COL.enemy; g.circle(enemy.x, enemy.y + 8, 18); g.fill();
      g.strokeColor = COL.claw; g.lineWidth = 3;
      g.moveTo(enemy.x - 12, enemy.y + 4); g.lineTo(enemy.x - 23, enemy.y - 8); g.stroke();
      g.moveTo(enemy.x + 12, enemy.y + 4); g.lineTo(enemy.x + 23, enemy.y - 8); g.stroke();
    }
    for (const b of s.bullets) {
      g.fillColor = COL.bullet; g.circle(b.x, b.y + 8, 4); g.fill();
    }
    const p = s.player;
    g.fillColor = COL.shadow; g.ellipse(p.x, p.y - 14, 23, 9); g.fill();
    if (p.deployed) {
      g.strokeColor = COL.deployed; g.lineWidth = 3;
      g.ellipse(p.x, p.y - 8, 37, 16); g.stroke();
    }
    g.fillColor = COL.marine; g.rect(p.x - 13, p.y - 2, 26, 36); g.fill();
    g.fillColor = COL.chest; g.rect(p.x - 10, p.y + 10, 20, 14); g.fill();
    g.fillColor = COL.marine; g.circle(p.x, p.y + 37, 10); g.fill();
    const target = s.enemies.reduce<typeof s.enemies[number] | null>((best, e) =>
      !best || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? e : best, null);
    const heading = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    g.strokeColor = COL.rifle; g.lineWidth = 6;
    g.moveTo(p.x + 5, p.y + 18);
    g.lineTo(p.x + 5 + Math.cos(heading) * 31, p.y + 18 + Math.sin(heading) * 31);
    g.stroke();

    if (this.activeTouch !== null) {
      const x = this.touchOrigin.x - w / 2, y = this.touchOrigin.y - h / 2;
      g.strokeColor = COL.stick; g.lineWidth = 2; g.circle(x, y, 56); g.stroke();
      g.fillColor = COL.stick;
      g.circle(x + this.touchMove.x * 40, y + this.touchMove.y * 40, 17); g.fill();
    }
    this.hud.string = s.over
      ? '机甲损毁 · 点击屏幕重开 / 按 R\n击杀 ' + s.kills
      : '无尽虫潮 · Cocos 迁移 PoC\n装甲 ' + s.player.hp + '/6 · 击杀 ' + s.kills
        + ' · ' + (s.player.deployed ? '火力展开' : '移动自动射击');
  }
}
