import Phaser from 'phaser';
import { GameScene, type RunResult } from './game/GameScene';
import './styles.css';

const scene = new GameScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 450,
  height: 800,
  backgroundColor: '#08121c',
  render: { antialias: true, pixelArt: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 450, height: 800 },
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

window.addEventListener('pagehide', () => {
  // Phaser owns canvas resources; no need to keep audio playing in the background.
  game.sound?.pauseAll();
});
