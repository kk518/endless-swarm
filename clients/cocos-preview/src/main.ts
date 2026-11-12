/**
 * Browser-only visual harness for the SAME TS world used by the Cocos PoC.
 * Rendering is temporary Canvas 2D; do not label this as a Cocos engine build.
 */
import { PocWorld, normalizedMove, type Vec2 } from '../../cocos/assets/scripts/PocWorld.ts';
import { PreviewOps } from './m6Ui.ts';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#battle');
if (!canvas) throw new Error('Preview canvas missing');
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unsupported');
const g = context;
let world: PocWorld;
const ops = new PreviewOps(restart);
world = ops.createWorld();
const hpFill = document.querySelector<HTMLElement>('#hp-fill')!;
const killCount = document.querySelector<HTMLElement>('#kill-count')!;
const waveCounter = document.querySelector<HTMLElement>('#wave-counter')!;
const playerLevel = document.querySelector<HTMLElement>('#player-level')!;
const arcUnlock = document.querySelector<HTMLElement>('#arc-unlock')!;
const stanceLabel = document.querySelector<HTMLElement>('#stance')!;
const message = document.querySelector<HTMLElement>('#battle-message')!;
const decisionOverlay = document.querySelector<HTMLElement>('#decision-overlay')!;
const decisionHeading = document.querySelector<HTMLElement>('#decision-heading')!;
const decisionOptions = document.querySelector<HTMLElement>('#decision-options')!;
let renderedDecision = '';
const endScreen = document.querySelector<HTMLElement>('#end-screen')!;
const endKills = document.querySelector<HTMLElement>('#end-kills')!;
const fpsLabel = document.querySelector<HTMLElement>('#frame-count')!;
const shaLabel = document.querySelector<HTMLElement>('#build-sha')!;

const keyboard = new Set<string>();
let activePointer: number | null = null;
let dragOrigin: Vec2 = { x: 0, y: 0 };
let stick: Vec2 = { x: 0, y: 0 };
let suspended = false;
let lastFrame = 0;
let frameNum = 0;
let fpsBegin = 0;

function releaseInput(): void {
  activePointer = null;
  stick = { x: 0, y: 0 };
  keyboard.clear();
  world.discardFrameDebt();
}
function restart(): void {
  releaseInput();
  world = ops.createWorld();
  endScreen.hidden = true;
  decisionOverlay.hidden = true;
  renderedDecision = '';
}
document.querySelector('#restart')!.addEventListener('click', restart);
document.querySelector('#restart-overlay')!.addEventListener('click', restart);

function touchPosition(e: PointerEvent): Vec2 {
  const b = canvas!.getBoundingClientRect();
  return { x: (e.clientX - b.left) / b.width * 450, y: (e.clientY - b.top) / b.height * 800 };
}
canvas.addEventListener('pointerdown', e => {
  if (activePointer !== null || suspended) return;
  if (world.state.over) { restart(); return; }
  const p = touchPosition(e);
  if (p.y < 350) return;
  activePointer = e.pointerId;
  dragOrigin = p;
  stick = { x: 0, y: 0 };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* Browser may revoke pointer */ }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer) return;
  const p = touchPosition(e);
  const dx = p.x - dragOrigin.x;
  const dy = p.y - dragOrigin.y;
  const distance = Math.hypot(dx, dy);
  const strength = Math.max(0, Math.min(1, (distance - 8) / 49));
  stick = distance < 0.00001 ? { x: 0, y: 0 }
    : { x: dx / distance * strength, y: -dy / distance * strength };
});
function pointerEnd(e: PointerEvent): void {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  stick = { x: 0, y: 0 };
  if (canvas!.hasPointerCapture(e.pointerId)) canvas!.releasePointerCapture(e.pointerId);
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('lostpointercapture', e => {
  if (e.pointerId === activePointer) { activePointer = null; stick = { x: 0, y: 0 }; }
});
window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (world.decision && /^[123]$/.test(key) && !e.repeat) {
    e.preventDefault();
    if (world.chooseDecision(Number(key) - 1)) releaseInput();
    return;
  }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
  if (key === 'r' && !e.repeat) restart();
  keyboard.add(key);
});
window.addEventListener('keyup', e => keyboard.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { suspended = true; releaseInput(); });
window.addEventListener('focus', () => { if (!document.hidden) { suspended = false; lastFrame = 0; releaseInput(); } });
document.addEventListener('visibilitychange', () => {
  suspended = document.hidden;
  lastFrame = 0;
  releaseInput();
});
function intent(): Vec2 {
  const x = stick.x
    + Number(keyboard.has('d') || keyboard.has('arrowright'))
    - Number(keyboard.has('a') || keyboard.has('arrowleft'));
  const y = stick.y
    + Number(keyboard.has('w') || keyboard.has('arrowup'))
    - Number(keyboard.has('s') || keyboard.has('arrowdown'));
  return normalizedMove(x, y);
}

function polygon(points: readonly [number, number][], color: string): void {
  g.fillStyle = color;
  g.beginPath();
  points.forEach(([x, y], i) => i === 0 ? g.moveTo(x, y) : g.lineTo(x, y));
  g.closePath();
  g.fill();
}
function strokeLine(points: readonly [number, number][], color: string, thickness: number): void {
  g.strokeStyle = color; g.lineWidth = thickness; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  points.forEach(([x, y], i) => i === 0 ? g.moveTo(x, y) : g.lineTo(x, y));
  g.stroke();
}
function ellipse(x: number, y: number, rx: number, ry: number, color: string): void {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}
function worldPoint(x: number, y: number): Vec2 { return { x: 225 + x, y: 400 - y }; }

function paintBackground(elapsed: number): void {
  const grad = g.createLinearGradient(0, 0, 450, 800);
  grad.addColorStop(0, '#102b36'); grad.addColorStop(.6, '#142b33'); grad.addColorStop(1, '#071820');
  g.fillStyle = grad; g.fillRect(0, 0, 450, 800);

  g.strokeStyle = '#3e63703d'; g.lineWidth = 1;
  for (let x = -120; x <= 570; x += 57) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 800); g.stroke();
  }
  for (let y = 0; y < 800; y += 57) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(450, y); g.stroke();
  }
  // Steel base / quarantine zone markings.
  g.save(); g.translate(225, 400);
  g.strokeStyle = '#427a785c'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(0, 0, 165, 70, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#8fbba838'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(0, 0, 210, 89, 0, 0, Math.PI * 2); g.stroke();
  g.rotate(-.19);
  g.fillStyle = '#27494c79';
  for (let x = -200; x <= 150; x += 110) g.fillRect(x, -275, 40, 8);
  g.restore();
  const phase = Math.sin(elapsed / 850) * .08 + .18;
  g.fillStyle = 'rgba(110,227,197,' + phase.toFixed(3) + ')';
  g.fillRect(24, 136, 4, 48);
  g.fillRect(422, 600, 4, 48);
  g.font = '11px monospace'; g.fillStyle = '#92adad8c'; g.fillText('QUARANTINE K-09', 26, 762);
}

function drawEnemy(x: number, y: number, time: number, kind: string, hp: number, maxHp: number): void {
  const bob = Math.sin(time / 170 + x * .12) * 1.8;
  g.save(); g.translate(x, y + bob);
  const scale = kind === 'boss' ? 2.4 : kind === 'armored' ? 1.35 : kind === 'leaper' ? .86 : 1;
  g.scale(scale, scale);
  ellipse(0, 11, 21, 8, '#020d15ad');
  // legs, spines and shell to imply depth without 3D models.
  for (const side of [-1, 1]) {
    for (const r of [-1, 0, 1]) {
      strokeLine([[side * 9, -1 + r * 5], [side * (19 + r * 2), 6 + r * 11], [side * 26, 5 + r * 12]], '#5a393d', 5);
      strokeLine([[side * 11, -1 + r * 5], [side * (19 + r * 2), 5 + r * 11]], '#cd7c76', 2);
    }
  }
  polygon([[-19, 4],[-15,-14],[0,-27],[16,-14],[19,7],[0,15]], '#4e2b36');
  polygon([[-14,-12],[0,-24],[12,-11],[8,5],[-7,5]],
    kind === 'boss' ? '#df7063' : kind === 'spitter' ? '#9bea6f' : kind === 'bomber' ? '#ff4d82'
      : kind === 'armored' ? '#ae8fa9' : kind === 'leaper' ? '#dd687f' : '#a04c60');
  polygon([[-6,-22],[2,-24],[12,-13],[6,-4]], '#ce7d6b');
  polygon([[-8,5],[8,5],[0,13]], '#321e2f');
  ellipse(-7,-2,3,2,'#ffcf7a'); ellipse(7,-2,3,2,'#ffcf7a');
  if (kind === 'boss' || kind === 'armored') {
    g.fillStyle='#081117'; g.fillRect(-22,-37,44,5);
    g.fillStyle=kind === 'boss' ? '#ffab86' : '#a6e9d8';
    g.fillRect(-22,-37,44 * Math.max(0,hp / maxHp),5);
  }
  g.restore();
}

function drawMarine(x: number, y: number, deployed: boolean, heading: number, time: number, heroId: string): void {
  const bob = deployed ? 0 : Math.sin(time / 130) * .7;
  g.save(); g.translate(x, y + bob);
  ellipse(0, 20, 22, 8, '#020d17b8');
  if (deployed) {
    g.strokeStyle = '#f7bf68a6'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 17, 43, 19, 0, 0, Math.PI * 2); g.stroke();
    for (const s of [-1,1]) {
      strokeLine([[s*13,4],[s*30,15],[s*36,22]], '#a5a8a5', 5);
      ellipse(s*36,22,6,3,'#daab6c');
    }
  } else {
    g.strokeStyle = '#2bb59b5c'; g.lineWidth = 1; g.beginPath(); g.ellipse(0, 16, 30, 12, 0, 0, Math.PI*2); g.stroke();
  }
  polygon([[-14,5],[-9,-12],[-1,-13],[-1,16],[-11,17]], '#304b55');
  polygon([[3,-13],[11,-13],[15,4],[11,18],[3,16]], '#284955');
  polygon([[-19,-17],[-17,-39],[-8,-47],[10,-46],[18,-33],[17,-8],[4,3],[-9,0]],
    heroId === 'kane' ? '#74664c' : '#2a505d');
  polygon([[-14,-34],[-10,-41],[10,-40],[14,-30],[8,-15],[-6,-15]],
    heroId === 'kane' ? '#d1b783' : '#77a5a0');
  polygon([[-8,-34],[8,-33],[4,-20],[-4,-21]], '#243a48');
  polygon([[-19,-29],[-27,-36],[-23,-46],[-11,-46],[-8,-32]], '#446f82');
  polygon([[12,-45],[23,-46],[29,-37],[22,-24],[10,-31]], '#39647b');
  polygon([[-13,-51],[-9,-63],[9,-63],[15,-52],[11,-43],[-10,-43]],
    heroId === 'kane' ? '#b5a682' : '#789e99');
  polygon([[-7,-57],[11,-55],[7,-49],[-8,-48]], deployed ? '#ffd68e' : '#6df0da');
  strokeLine([[-23,-39],[-11,-43]], '#a5d6ce', 2);
  strokeLine([[14,-41],[24,-38]], '#b2d7d0', 2);
  // A visible rifle faces the selected enemy; body remains stylized 2.5D.
  g.save(); g.translate(0, -28); g.rotate(-heading);
  polygon([[-4,-4],[19,-5],[24,-3],[26,0],[19,4],[-4,5]], '#172a33');
  polygon([[3,-6],[19,-6],[22,-2],[7,-2]], '#99bdbc');
  polygon([[20,-2],[37,-2],[37,2],[20,2]], '#56676c');
  ellipse(36,0,2,2,deployed ? '#ffc176' : '#9dfcf0');
  g.restore();
  g.restore();
}

function paint(dt: number): void {
  const s = world.state;
  // Keep canvas physical pixels crisp while drawing at a fixed 450x800 logical size.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas!.clientWidth || 450;
  const cssH = canvas!.clientHeight || 800;
  const actualW = Math.round(cssW * dpr), actualH = Math.round(cssH * dpr);
  if (canvas!.width !== actualW || canvas!.height !== actualH) {
    canvas!.width = actualW; canvas!.height = actualH;
  }
  g.setTransform(actualW / 450, 0, 0, actualH / 800, 0, 0);
  paintBackground(s.elapsedMs);

  const ordered = s.enemies.slice().sort((a, b) => b.y - a.y);
  const p = worldPoint(s.player.x, s.player.y);
  let marineDrawn = false;
  const best = s.enemies.reduce<typeof s.enemies[number] | null>((acc,e) =>
    !acc || (e.x-s.player.x)**2+(e.y-s.player.y)**2 < (acc.x-s.player.x)**2+(acc.y-s.player.y)**2 ? e : acc, null);
  const heading = best ? Math.atan2(best.y - s.player.y, best.x - s.player.x) : 0;
  for (const enemy of ordered) {
    const position = worldPoint(enemy.x, enemy.y);
    if (!marineDrawn && position.y > p.y) {
      drawMarine(p.x, p.y, s.player.deployed, heading, s.elapsedMs, s.heroId);
      marineDrawn = true;
    }
    drawEnemy(position.x, position.y, s.elapsedMs,
      enemy.kind ?? 'grunt', enemy.hp, enemy.maxHp ?? 64);
    if (enemy.elite) {
      g.strokeStyle = '#ffc782'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(position.x, position.y - 8, 30, 0, Math.PI * 2); g.stroke();
    }
    if ((enemy.windupMs ?? 0) > 0 && (enemy.kind === 'leaper'
      || enemy.kind === 'spitter' || enemy.kind === 'boss')) {
      const radius = enemy.kind === 'boss' ? 65 : 26;
      g.strokeStyle = enemy.kind === 'spitter' ? '#afe787' : '#ffa578';
      g.lineWidth = 2;
      g.beginPath();g.arc(position.x,position.y-8,radius,0,Math.PI*2);g.stroke();
    }
    if ((enemy.windupMs ?? 0) > 0 && enemy.kind === 'bomber') {
      g.fillStyle = 'rgba(255,45,82,0.12)';
      g.strokeStyle = '#ff5d87'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(position.x, position.y, 105, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.strokeStyle = '#ffe3b5'; g.lineWidth = 3;
      g.beginPath(); g.arc(position.x, position.y, 105, -Math.PI / 2,
        -Math.PI / 2 + (1 - (enemy.windupMs ?? 0) / 850) * Math.PI * 2); g.stroke();
    }
  }
  if (!marineDrawn) drawMarine(p.x, p.y, s.player.deployed, heading, s.elapsedMs, s.heroId);
  // M5.3: visible 700ms arrival telegraph BEFORE a bug becomes targetable.
  for (const arrival of s.arrivals) {
    const spot = worldPoint(arrival.x,arrival.y);
    const intensity = 1 - arrival.remainingMs / arrival.durationMs;
    const radius = (arrival.kind === 'boss' ? 32 : 19) * (0.75 + intensity * 0.7);
    g.fillStyle = 'rgba(255,131,103,0.13)';
    g.strokeStyle = arrival.elite ? '#ffd093' : '#ff916c';
    g.lineWidth = 2 + intensity;
    g.beginPath();g.arc(spot.x,spot.y - 8,radius,0,Math.PI*2);g.fill();g.stroke();
  }
  for (const acid of s.acids) {
    const spot = worldPoint(acid.x,acid.y);
    ellipse(spot.x,spot.y-12,8,6,'#a8f47a');
    ellipse(spot.x,spot.y-12,3,3,'#ecffd5');
  }
  for (const supply of s.supplies) {
    const pos = worldPoint(supply.x, supply.y);
    const tint = supply.kind === 'repair' ? '#85f5b1' : supply.kind === 'overclock'
      ? '#ffd47a' : '#8cb7ff';
    g.strokeStyle = tint; g.lineWidth = 2;
    g.beginPath();g.arc(pos.x,pos.y-12,18,0,Math.PI*2);g.stroke();
    ellipse(pos.x,pos.y-12,10,10,tint);
  }
  for (const pulse of s.pulses) {
    const pos = worldPoint(pulse.x,pulse.y);
    g.strokeStyle = pulse.kind === 'bomber' ? '#ff657d' : '#8ab7ff';
    g.lineWidth = 5 * Math.min(1,pulse.remainingMs/140);
    g.beginPath();g.arc(pos.x,pos.y,pulse.radius,0,Math.PI*2);g.stroke();
  }
  for (const bullet of s.bullets) {
    const b = worldPoint(bullet.x, bullet.y);
    const buckshot = bullet.source === 'scatter';
    ellipse(b.x, b.y - 15, buckshot ? 5 : 7, 3, buckshot ? '#ff925bcb' : '#ff9e52b0');
    ellipse(b.x, b.y - 17, buckshot ? 3 : 4, 2, buckshot ? '#ffe0a6' : '#fff3b4');
  }
  for (const arc of s.lightning) {
    const a = worldPoint(arc.fromX, arc.fromY), b = worldPoint(arc.toX, arc.toY);
    const rail = arc.kind === 'rail', flame = arc.kind === 'flame';
    const strength = Math.min(1, arc.remainingMs/(flame ? 135 : rail ? 190 : 90));
    const middleX = (a.x+b.x)/2+(rail||flame?0:7);
    const middleY = (a.y+b.y)/2-(rail||flame?23:35);
    g.lineWidth = flame ? 17 : rail ? 11 : 5;
    g.strokeStyle = flame ? 'rgba(255,88,42,'+(strength*.42)+')'
      : rail ? 'rgba(250,155,78,'+(strength*.50)+')'
      : 'rgba(77,189,238,'+(strength*.45)+')';
    g.beginPath();g.moveTo(a.x,a.y-24);g.lineTo(middleX,middleY);g.lineTo(b.x,b.y-22);g.stroke();
    g.lineWidth = flame ? 5 : rail ? 4 : 2;
    g.strokeStyle = flame ? 'rgba(255,215,95,'+strength+')'
      : rail ? 'rgba(255,240,165,'+strength+')'
      : 'rgba(197,247,255,'+strength+')';
    g.beginPath();g.moveTo(a.x,a.y-24);g.lineTo(middleX,middleY);g.lineTo(b.x,b.y-22);g.stroke();
  }
  if (activePointer !== null) {
    const j = dragOrigin;
    g.strokeStyle='#83dfc794'; g.lineWidth=2;
    g.beginPath();g.arc(j.x,j.y,57,0,Math.PI*2);g.stroke();
    ellipse(j.x + stick.x * 43, j.y - stick.y * 43, 17, 17, '#7ae9d49c');
  }
  if (dt > 100) {
    g.font='11px monospace';g.fillStyle='#eecb8877';g.fillText('RECOVERING FRAME...',20,200);
  }
}

function showSafeDecision(): void {
  const decision = world.decision;
  decisionOverlay.hidden = !decision;
  if (!decision) { renderedDecision = ''; return; }
  const key = world.state.wave + ':' + decision.kind + ':' + decision.options.map(option => option.id).join(',');
  if (renderedDecision === key) return;
  // A previously held movement gesture must never continue after a reward.
  releaseInput();
  renderedDecision = key;
  decisionHeading.textContent = decision.kind === 'card'
    ? '第 ' + world.state.wave + ' 段完成 · 战术模块三选一'
    : '路线分岔 · 选择安全或高风险路线';
  const cards = decision.options.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'decision-card';
    button.setAttribute('aria-label', option.name + '：' + option.description);
    button.innerHTML = '';
    const number = document.createElement('span');
    number.className = 'decision-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('strong');
    title.textContent = option.name;
    const details = document.createElement('span');
    details.className = 'decision-description';
    details.textContent = option.description;
    button.append(number, title, details);
    button.addEventListener('click', () => {
      if (!world.chooseDecision(index)) return;
      releaseInput();
      decisionOverlay.hidden = true;
      renderedDecision = '';
    });
    return button;
  });
  decisionOptions.replaceChildren(...cards);
}

function ui(): void {
  ops.settleIfOver(world);
  showSafeDecision();
  const s = world.state;
  hpFill.style.width = Math.max(0, s.player.hp / s.player.maxHp * 100) + '%';
  killCount.textContent = String(s.kills).padStart(3,'0')
    + (s.streak >= 2 ? ' · ' + s.streak + '连杀' : '')
    + (s.suppliesCollected > 0 ? ' · +' + s.suppliesCollected + '补给' : '');
  waveCounter.textContent = (s.mode === 'expedition' ? 'EXPEDITION ' : 'WAVE ')
    + String(s.wave).padStart(2,'0') + ' / ' + String(s.totalStages).padStart(2,'0');
  playerLevel.textContent = 'LV.' + String(s.level).padStart(2,'0')
    + ' · XP ' + s.xp + '/' + s.xpToNext;
  const weaponNames: Record<string, string> = { rifle: '步枪', scatter: '散射炮', arc: '电弧', flame: '喷火器' };
  arcUnlock.textContent = s.weapons.map(id => weaponNames[id] + ' Lv.' + s.weaponLevels[id]
    + (s.evolved[id] ? ' ★' : '')).join(' · ');
  arcUnlock.classList.toggle('unlocked', s.weapons.length > 1);
  const isDeployed = s.player.deployed;
  // Hero-specific attacks are resolved in the shared world, not this Canvas renderer.
  stanceLabel.classList.toggle('active', isDeployed);
  stanceLabel.textContent = s.overclockMs > 0 ? '⚡ 补给超频 · 射速 +45%'
    : isDeployed ? '⚡ 火力展开 · 伤害与射速提升' : '机动射击 · 松手展开';
  message.textContent = suspended
    ? '游戏已暂停 · 返回页面后继续'
    : world.decision ? '波次已结束 · 请选择战术奖励或路线'
    : activePointer !== null ? '移动中 · 武器持续自动攻击'
    : '按住下半屏拖动移动 · 静止 0.8 秒火力展开';
  if (s.over) {
    endScreen.querySelector('p')!.textContent = s.won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    endScreen.querySelector('strong')!.textContent = s.won ? '虫巢巨兽已歼灭' : '战士阵亡';
    endKills.textContent = '第 ' + s.wave + ' 波 · 已击杀 ' + s.kills + ' 只虫族';
    endScreen.hidden = false;
  }
}

function frame(now: number): void {
  const delta = lastFrame ? Math.min(250, now - lastFrame) : 0;
  lastFrame = now;
  if (!suspended) world.advance(delta, intent());
  paint(delta); ui();
  frameNum++;
  if (now - fpsBegin >= 1000) {
    fpsLabel.textContent = String(Math.round(frameNum * 1000 / Math.max(1,now - fpsBegin)));
    fpsBegin = now; frameNum = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The build pipeline writes this exact SHA before deploying an isolated preview.
fetch('./preview-version.json', { cache:'no-store' })
  .then(r => r.ok ? r.json() : null)
  .then(v => { if (v?.commit) shaLabel.textContent = String(v.commit).slice(0,12); })
  .catch(() => { /* Local Vite dev has no deploy marker. */ });
