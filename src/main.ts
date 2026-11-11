import Phaser from 'phaser';
import { GameScene, type RewardOffer, type RunResult } from './game/GameScene';
import './styles.css';

// Use the full vertical viewport on tall phones rather than letterboxing 9:16.
const portraitPhone = window.matchMedia('(max-width: 850px)').matches && window.innerHeight > window.innerWidth;
const viewportHeight = (): number => {
  const portrait = window.matchMedia('(max-width: 850px)').matches && window.innerHeight > window.innerWidth;
  return portrait ? Math.round(450 * window.innerHeight / window.innerWidth) : 800;
};
const logicalHeight = portraitPhone ? viewportHeight() : 800;
const scene = new GameScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 450,
  height: logicalHeight,
  backgroundColor: '#0c141a',
  render: { antialias: true, pixelArt: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 450, height: logicalHeight },
  scene: [scene],
  fps: { target: 60, forceSetTimeOut: false },
});

const overlay = document.querySelector<HTMLElement>('#overlay')!;
const title = document.querySelector<HTMLElement>('#overlay-title')!;
const subtitle = document.querySelector<HTMLElement>('#overlay-subtitle')!;
const instructions = document.querySelector<HTMLElement>('#overlay-instructions')!;
const stats = document.querySelector<HTMLElement>('#run-stats')!;
const startButton = document.querySelector<HTMLButtonElement>('#play-button')!;
const muteButton = document.querySelector<HTMLButtonElement>('#mute-button')!;
const rewardOverlay = document.querySelector<HTMLElement>('#reward-overlay')!;
const rewardTitle = document.querySelector<HTMLElement>('#reward-title')!;
const rewardCards = document.querySelector<HTMLElement>('#reward-cards')!;
const cardCategory: Record<string, string> = {
  weapon: '新武器', assault: '通用火力', mobile: '机动构筑', deploy: '站桩构筑', survival: '生存强化',
};

function beginRun(): void {
  // The scene is created during boot; if early on slow devices, wait one frame.
  if (!game.isBooted || !scene.sys.isActive()) {
    startButton.disabled = true;
    window.setTimeout(() => { startButton.disabled = false; beginRun(); }, 100);
    return;
  }
  scene.startRun();
  rewardOverlay.classList.add('is-hidden');
  overlay.classList.add('is-hidden');
  document.querySelector<HTMLElement>('#game')?.focus();
}

startButton.addEventListener('click', beginRun);

window.addEventListener('swarm:reward', (event) => {
  const offer = (event as CustomEvent<RewardOffer>).detail;
  rewardTitle.textContent = `第 ${offer.wave} 波完成 · 三选一`;
  rewardCards.replaceChildren();
  for (const [i, card] of offer.options.entries()) {
    const button = document.createElement('button');
    button.className = 'reward-card';
    button.type = 'button';
    button.dataset.category = card.category;
    const serial = document.createElement('span');
    serial.className = 'reward-card-serial';
    serial.textContent = `MODULE / 0${i + 1}`;
    const icon = document.createElement('span');
    icon.className = 'reward-card-icon'; icon.textContent = card.icon;
    const name = document.createElement('strong');
    name.className = 'reward-card-name'; name.textContent = card.name;
    const description = document.createElement('span');
    description.className = 'reward-card-description'; description.textContent = card.description;
    const category = document.createElement('span');
    category.className = 'reward-card-category'; category.textContent = cardCategory[card.category] ?? '强化';
    button.append(serial, icon, name, description, category);
    button.addEventListener('click', () => {
      if (!scene.chooseCard(card.id)) return;
      rewardOverlay.classList.add('is-hidden');
      document.querySelector<HTMLElement>('#game')?.focus();
    });
    rewardCards.append(button);
  }
  rewardOverlay.classList.remove('is-hidden');
  rewardCards.querySelector('button')?.focus();
});

window.addEventListener('swarm:gameover', (event) => {
  const { kills, survived, record, victory, wave, weapons, bestStreak } = (event as CustomEvent<RunResult>).detail;
  title.textContent = victory ? '隔离区已肃清' : '通讯信号中断';
  subtitle.textContent = victory ? '任务完成 / 战区 K-09 恢复通讯' : '任务失败 / 重新部署最后的防线';
  instructions.classList.add('is-hidden');
  const entry = (value: string, label: string): HTMLElement => {
    const wrapper = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = value;
    const span = document.createElement('span'); span.textContent = label;
    wrapper.append(strong, span);
    return wrapper;
  };
  stats.replaceChildren(entry(`${wave}/5`, '最终波次'), entry(String(kills), '击杀虫族'), entry(String(bestStreak), '最高连杀'));
  stats.classList.remove('is-hidden');
  stats.setAttribute('aria-label', `存活 ${survived}，装备 ${weapons.length} 把武器，历史最佳 ${record} 次击杀`);
  startButton.textContent = '重新执行行动';
  rewardOverlay.classList.add('is-hidden');
  overlay.classList.remove('is-hidden');
});

let muted = false;
muteButton.addEventListener('click', () => {
  muted = !muted;
  scene.setMuted(muted);
  muteButton.textContent = muted ? '开启音效' : '关闭音效';
  muteButton.setAttribute('aria-pressed', String(muted));
});

/** Browser navigation, calls and app switches must freeze combat, not fast-forward it. */
function pauseForInterruption(): void {
  scene.pauseControls();
  if (game.scene.isActive('Battle')) game.scene.pause('Battle');
  game.sound?.pauseAll();
}
function resumeAfterInterruption(): void {
  if (document.hidden) return;
  scene.pauseControls();
  if (game.scene.isPaused('Battle')) game.scene.resume('Battle');
  game.sound?.resumeAll();
}
window.addEventListener('pagehide', pauseForInterruption);
window.addEventListener('pageshow', resumeAfterInterruption);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForInterruption();
  else resumeAfterInterruption();
});
window.addEventListener('blur', pauseForInterruption);
window.addEventListener('focus', resumeAfterInterruption);
window.addEventListener('pointercancel', () => scene.pauseControls());

/** Address-bar changes / phone rotation must not strand HUD labels off-screen. */
window.addEventListener('resize', () => {
  const height = viewportHeight();
  if (game.scale.height !== height) game.scale.resize(450, height);
});
