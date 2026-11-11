import Phaser from 'phaser';
import { GameScene, type RunResult } from './game/GameScene';
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
  backgroundColor: '#08121c',
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

function beginRun(): void {
  // The scene is created during boot; if early on slow devices, wait one frame.
  if (!game.isBooted || !scene.sys.isActive()) {
    startButton.disabled = true;
    window.setTimeout(() => { startButton.disabled = false; beginRun(); }, 100);
    return;
  }
  scene.startRun();
  overlay.classList.add('is-hidden');
  document.querySelector<HTMLElement>('#game')?.focus();
}

startButton.addEventListener('click', beginRun);

window.addEventListener('swarm:gameover', (event) => {
  const { kills, survived, record } = (event as CustomEvent<RunResult>).detail;
  title.textContent = '本次行动结束';
  subtitle.textContent = '信号中断，但火力绝不停歇。';
  instructions.classList.add('is-hidden');
  stats.innerHTML = `<div><strong>${kills}</strong><span>消灭虫族</span></div><div><strong>${survived}</strong><span>生存时间</span></div><div><strong>${record}</strong><span>历史最佳击杀</span></div>`;
  stats.classList.remove('is-hidden');
  startButton.textContent = '再次出击';
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
