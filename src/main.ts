import Phaser from 'phaser';
import { GameScene, type RewardOffer, type RouteOffer, type RunResult } from './game/GameScene';
import { DEFAULT_TRAINING, type TrainingFocus } from './game/autoGrowth';
import type { WeaponId } from './game/progression';
import { MOBILE_WORLD_WIDTH, HUD_DESIGN_WIDTH } from './game/visibility';
import { CONTENT_CATALOG } from './game/contentCatalog';
import { readMetaProgress, purchaseStoredArmor, nextArmorCost } from './game/metaProgression';
import { readRunSafeSave, clearRunSafeSave } from './game/runSafeSave';
import './styles.css';

// Use the full vertical viewport on tall phones rather than letterboxing 9:16.
const portraitPhone = window.matchMedia('(max-width: 850px)').matches && window.innerHeight > window.innerWidth;
// Widen the world canvas rather than camera.zoom: HUD and joystick keep their
// physical size through the independently scaled HUD container in GameScene.
const logicalWidth = (): number => {
  const portrait = window.matchMedia('(max-width: 850px)').matches && window.innerHeight > window.innerWidth;
  return portrait ? MOBILE_WORLD_WIDTH : HUD_DESIGN_WIDTH;
};
const viewportHeight = (): number => {
  const portrait = window.matchMedia('(max-width: 850px)').matches && window.innerHeight > window.innerWidth;
  return portrait ? Math.round(logicalWidth() * window.innerHeight / window.innerWidth) : 800;
};
const logicalHeight = portraitPhone ? viewportHeight() : 800;
const scene = new GameScene();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: logicalWidth(),
  height: logicalHeight,
  backgroundColor: '#0c141a',
  render: { antialias: true, pixelArt: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: logicalWidth(), height: logicalHeight },
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
const startFocus = document.querySelector<HTMLSelectElement>('#start-training-focus')!;
const startCampaign = document.querySelector<HTMLSelectElement>('#start-campaign')!;
const resumeButton = document.querySelector<HTMLButtonElement>('#resume-button')!;
const armorUpgradeButton = document.querySelector<HTMLButtonElement>('#armor-upgrade-button')!;
const metaWallet = document.querySelector<HTMLElement>('#meta-wallet')!;
const metaArmorStatus = document.querySelector<HTMLElement>('#meta-armor-status')!;
const metaStorageStatus = document.querySelector<HTMLElement>('#meta-storage-status')!;
const rewardDescription = document.querySelector<HTMLElement>('#reward-description')!;
const rewardFooterCopy = document.querySelector<HTMLElement>('#reward-footer-copy')!;
const rewardWeapon = document.querySelector<HTMLSelectElement>('#reward-training-weapon')!;
const rewardFocus = document.querySelector<HTMLSelectElement>('#reward-training-focus')!;
const weaponName = (id: WeaponId): string => CONTENT_CATALOG.weapons.get(id)?.name ?? id;
const cardCategory: Record<string, string> = {
  weapon: '新武器', assault: '通用火力', mobile: '机动构筑', deploy: '站桩构筑', survival: '生存强化',
};

function getSavedExpedition() {
  try { return readRunSafeSave(localStorage); } catch { return null; }
}
function refreshResumeButton(): void {
  const saved = getSavedExpedition();
  resumeButton.classList.toggle('is-hidden', !saved);
  if (saved) resumeButton.textContent = `继续远征 · 第 ${saved.campaign.stageIndex + 1} / 9 段`;
  startButton.textContent = saved ? '放弃旧远征，重新出击' : '执行登陆行动';
}
function refreshArmory(message?: string): void {
  let meta;
  try { meta = readMetaProgress(localStorage); } catch { meta = null; }
  if (!meta) {
    metaWallet.textContent = '本地战备不可用';
    metaArmorStatus.textContent = '无法读取本地存档';
    armorUpgradeButton.disabled = true;
    metaStorageStatus.textContent = message ?? '浏览器本地存储不可用，战备和远征无法可靠保存。';
    return;
  }
  const cost = nextArmorCost(meta);
  metaWallet.textContent = `战备数据 ${meta.warData}`;
  metaArmorStatus.textContent = `装甲工坊 Lv.${meta.armorRank}/3 · 下局初始装甲上限 +${meta.armorRank}`;
  armorUpgradeButton.disabled = cost === null || meta.warData < cost;
  armorUpgradeButton.textContent = cost === null ? '基础装甲已强化至上限'
    : `升级装甲至 Lv.${meta.armorRank + 1} · 消耗 ${cost} 战备`;
  metaStorageStatus.textContent = message ?? '有效失败也可获得战备；仅保存在此浏览器，清除网站数据会丢失。';
}
function beginRun(): void {
  if (!game.isBooted || !scene.sys.isActive()) {
    startButton.disabled = true;
    window.setTimeout(() => { startButton.disabled = false; beginRun(); }, 100);
    return;
  }
  const saved = getSavedExpedition();
  if (saved) {
    if (!window.confirm('已有尚未完成的三幕远征。确定放弃存档并重新开始吗？')) return;
    if (!clearRunSafeSave(localStorage)) {
      refreshArmory('无法删除旧存档，请检查浏览器存储权限。');
      return;
    }
  }
  scene.startRun({ weapon: DEFAULT_TRAINING.weapon, focus: startFocus.value as TrainingFocus },
    startCampaign.value === 'expedition' ? 'expedition' : 'prototype');
  rewardOverlay.classList.add('is-hidden');
  overlay.classList.add('is-hidden');
  refreshResumeButton();
  document.querySelector<HTMLElement>('#game')?.focus();
}

startButton.addEventListener('click', beginRun);
resumeButton.addEventListener('click', () => {
  if (!game.isBooted || !scene.sys.isActive()) return;
  const saved = getSavedExpedition();
  if (!saved) { refreshResumeButton(); return; }
  overlay.classList.add('is-hidden');
  rewardOverlay.classList.add('is-hidden');
  if (!scene.resumeSavedExpedition(saved)) {
    overlay.classList.remove('is-hidden');
    refreshArmory('远征快照版本不兼容，无法恢复，请使用重新出击。');
    return;
  }
  document.querySelector<HTMLElement>('#game')?.focus();
});
armorUpgradeButton.addEventListener('click', () => {
  let purchased;
  try { purchased = purchaseStoredArmor(localStorage); } catch { purchased = null; }
  if (!purchased) { refreshArmory('装甲购买未成功保存，请检查浏览器本地存储。'); return; }
  refreshArmory(purchased.bought
    ? `永久装甲已升级至 Lv.${purchased.meta.armorRank}，下次出击立即生效。`
    : '战备不足，或装甲已经强化到上限。');
});
window.addEventListener('swarm:storage-warning', () => {
  refreshArmory('警告：安全节点存档失败，本次远征刷新后可能无法恢复。');
});
refreshArmory();
refreshResumeButton();

window.addEventListener('swarm:reward', (event) => {
  const offer = (event as CustomEvent<RewardOffer>).detail;
  rewardWeapon.replaceChildren();
  for (const weapon of offer.equipped) {
    const option = document.createElement('option');
    option.value = weapon;
    option.textContent = weaponName(weapon);
    rewardWeapon.append(option);
  }
  rewardWeapon.value = offer.equipped.includes(offer.training.weapon)
    ? offer.training.weapon : offer.equipped[0];
  rewardFocus.value = offer.training.focus;
  rewardTitle.textContent = `${offer.actTitle} · ${offer.encounterTitle}（${offer.wave}/${offer.totalStages}）`;
  rewardOverlay.dataset.mode = 'card';
  rewardDescription.textContent = '阶段结束 · 选择一张战术模块（不会额外打断战斗经验升级）';
  rewardFooterCopy.textContent = '选取一项装备模块 / 立即生效';
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
      scene.setTraining(rewardWeapon.value as WeaponId, rewardFocus.value as TrainingFocus);
      if (!scene.chooseCard(card.id)) return;
      rewardOverlay.classList.add('is-hidden');
      document.querySelector<HTMLElement>('#game')?.focus();
    });
    rewardCards.append(button);
  }
  rewardOverlay.classList.remove('is-hidden');
  rewardCards.querySelector('button')?.focus();
});

window.addEventListener('swarm:route', (event) => {
  const offer = (event as CustomEvent<RouteOffer>).detail;
  rewardOverlay.dataset.mode = 'route';
  rewardTitle.textContent = `${offer.actTitle} · 路线抉择（${offer.wave}/${offer.totalStages}）`;
  rewardDescription.textContent = offer.options.length > 1
    ? `${offer.encounterTitle}已完成 · 选择安全补给或高危突进。`
    : `${offer.encounterTitle}已完成 · 当前装甲过低，仅可选择安全路线。`;
  rewardFooterCopy.textContent = '路线选择立即生效 / 无额外弹窗';
  rewardCards.replaceChildren();
  for (const [i, choice] of offer.options.entries()) {
    const button = document.createElement('button');
    button.className = 'reward-card';
    button.type = 'button';
    button.dataset.category = choice.risk;
    const serial = document.createElement('span');
    serial.className = 'reward-card-serial';
    serial.textContent = `ROUTE / 0${i + 1}`;
    const icon = document.createElement('span');
    icon.className = 'reward-card-icon'; icon.textContent = choice.icon;
    const name = document.createElement('strong');
    name.className = 'reward-card-name'; name.textContent = choice.name;
    const desc = document.createElement('span');
    desc.className = 'reward-card-description'; desc.textContent = choice.description;
    const risk = document.createElement('span');
    risk.className = 'reward-card-category';
    risk.textContent = choice.risk === 'hazard' ? '高风险 / 长期火力收益' : '安全路线 / 装甲恢复';
    button.append(serial, icon, name, desc, risk);
    button.addEventListener('click', () => {
      if (!scene.chooseRoute(choice.id)) return;
      rewardOverlay.classList.add('is-hidden');
      document.querySelector<HTMLElement>('#game')?.focus();
    });
    rewardCards.append(button);
  }
  rewardOverlay.classList.remove('is-hidden');
  rewardCards.querySelector('button')?.focus();
});

window.addEventListener('swarm:gameover', (event) => {
  const { kills, survived, record, victory, wave, totalStages, weapons, bestStreak, level, evolutions, heroId, actTitle, warDataEarned, totalWarData, settlementSaved } = (event as CustomEvent<RunResult>).detail;
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
  stats.replaceChildren(entry(CONTENT_CATALOG.heroes.get(heroId)?.name ?? heroId, '出击角色'), entry(`${wave}/${totalStages}`, `最终进度 · ${actTitle}`), entry(String(level), '本局等级'), entry(String(evolutions.length), '武器进化'), entry(String(kills), '击杀虫族'), entry(String(bestStreak), '最高连杀'), entry(settlementSaved ? `+${warDataEarned}` : '未保存', '本局战备'), entry(String(totalWarData), '持有战备'));
  stats.classList.remove('is-hidden');
  stats.setAttribute('aria-label', `存活 ${survived}，装备 ${weapons.length} 把武器，历史最佳 ${record} 次击杀`);
  startButton.textContent = '重新执行行动';
  rewardOverlay.classList.add('is-hidden');
  overlay.classList.remove('is-hidden');
  refreshArmory(settlementSaved ? `本局战备已结算：+${warDataEarned}` : '战备结算未保存，请检查本地存储。');
  refreshResumeButton();
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
  const width = logicalWidth(), height = viewportHeight();
  if (game.scale.width !== width || game.scale.height !== height) game.scale.resize(width, height);
});
