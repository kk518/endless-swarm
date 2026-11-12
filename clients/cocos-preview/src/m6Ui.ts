/**
 * Browser hangar adapter for the engine-independent M6.1a domain rules.
 * Uses a preview-only storage namespace. Main Phaser /swarm/ progression is
 * NEVER read or overwritten by this migration exercise.
 */
import { BATTLEFIELDS, DEFAULT_BATTLEFIELD, getBattlefield, isBattlefieldId, type BattlefieldId } from '../../cocos/assets/scripts/m6/battlefields.ts';
import {
  readMetaProgress, settleStoredRun, purchaseStoredArmor, purchaseStoredEquipment,
  nextArmorCost, nextEquipmentCost, newMetaProgress,
  type EquipmentId, type MetaStorage, type MetaProgress,
} from '../../cocos/assets/scripts/m6/metaProgression.ts';
import { newRunSeed } from '../../cocos/assets/scripts/m6/runRandom.ts';
import {
  readRunSafeSave, writeRunSafeSave, clearRunSafeSave,
  type RunSafeSave, type SafeRunStorage,
} from '../../cocos/assets/scripts/m6/runSafeSave.ts';
import { PocWorld } from '../../cocos/assets/scripts/PocWorld.ts';
import { mobileViewport } from '../../cocos/assets/scripts/PocViewport.ts';
import type { CampaignMode } from '../../cocos/assets/scripts/m6/runController.ts';
import { POC_CATALOG, POC_PLAYABLE_HEROES, type PocHeroId } from '../../cocos/assets/scripts/PocRoster.ts';

const STORAGE_PREFIX = 'cocos-preview-m6:';
const ZONE_KEY = STORAGE_PREFIX + 'zone';
const HERO_KEY = STORAGE_PREFIX + 'hero';
const MODE_KEY = STORAGE_PREFIX + 'mode';
const storage: MetaStorage & SafeRunStorage = {
  getItem(key: string): string | null {
    try { return localStorage.getItem(STORAGE_PREFIX + key); }
    catch { return null; }
  },
  setItem(key: string, value: string): void {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  },
  removeItem(key: string): void {
    localStorage.removeItem(STORAGE_PREFIX + key);
  },
};

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing migration UI control: ' + id);
  return node as T;
}
function initialZone(): BattlefieldId {
  try {
    const stored = localStorage.getItem(ZONE_KEY);
    return isBattlefieldId(stored) ? stored : DEFAULT_BATTLEFIELD;
  } catch { return DEFAULT_BATTLEFIELD; }
}
function initialHero(): PocHeroId {
  try {
    const stored = localStorage.getItem(HERO_KEY);
    return stored === 'kane' ? 'kane' : 'marine';
  } catch { return 'marine'; }
}
function initialMode(): CampaignMode {
  try { return localStorage.getItem(MODE_KEY) === 'expedition' ? 'expedition' : 'prototype'; }
  catch { return 'prototype'; }
}
export class PreviewOps {
  private zone: BattlefieldId = initialZone();
  private heroId: PocHeroId = initialHero();
  private mode: CampaignMode = initialMode();
  private currentRunId = '';
  private settled = false;
  private nextRestore: RunSafeSave | null = null;
  private lastSavedFingerprint = '';
  private report = '结算后自动写入预览版独立存档；升级下一局生效。';

  constructor(onRestart: () => void) {
    el<HTMLButtonElement>('zone-steel').addEventListener('click', () => this.selectZone('steel-ruins', onRestart));
    el<HTMLButtonElement>('zone-nest').addEventListener('click', () => this.selectZone('infested-nest', onRestart));
    el<HTMLButtonElement>('hero-marine').addEventListener('click', () => this.selectHero('marine', onRestart));
    el<HTMLButtonElement>('hero-kane').addEventListener('click', () => this.selectHero('kane', onRestart));
    el<HTMLButtonElement>('mode-prototype').addEventListener('click', () => this.selectMode('prototype', onRestart));
    el<HTMLButtonElement>('mode-expedition').addEventListener('click', () => this.selectMode('expedition', onRestart));
    el<HTMLButtonElement>('resume-expedition').addEventListener('click', () => {
      const saved = readRunSafeSave(storage);
      if (!saved) { this.report = '没有可恢复的安全节点。'; this.render(); return; }
      this.nextRestore = saved;
      this.mode = 'expedition';
      this.zone = saved.battlefieldId;
      this.heroId = 'marine'; // canonical schema v2 validates marine only
      onRestart();
      this.report = '已恢复远征第 ' + (saved.campaign.stageIndex + 1)
        + ' 段，保留原有构筑、专精和已抽取卡牌。';
      this.render();
    });
    el<HTMLButtonElement>('buy-armor').addEventListener('click', () => this.purchase('armor'));
    el<HTMLButtonElement>('buy-frame').addEventListener('click', () => this.purchase('weapon-frame'));
    el<HTMLButtonElement>('buy-repair').addEventListener('click', () => this.purchase('repair-module'));
    this.render();
  }

  private selectZone(next: BattlefieldId, onRestart: () => void): void {
    if (this.zone === next) return;
    this.zone = next;
    try { localStorage.setItem(ZONE_KEY, next); }
    catch { this.report = '战区选择只在当前页面有效：本机存储不可写。'; }
    onRestart(); // an explicit zone switch begins a new PoC run; no in-battle payout.
    this.report = '已切换至' + getBattlefield(next).name + '，重新出击。';
    this.render();
  }
  private selectHero(next: PocHeroId, onRestart: () => void): void {
    if (this.heroId === next) return;
    if (!POC_PLAYABLE_HEROES.includes(next)) throw new Error('Hero not registered');
    this.heroId = next;
    try { localStorage.setItem(HERO_KEY, next); }
    catch { this.report = '英雄选择仅保留在当前会话：浏览器存储不可写。'; }
    onRestart(); // a hero change starts a new run without settlement
    this.report = '已切换出战英雄：' + POC_CATALOG.heroes.get(next)!.name;
    this.render();
  }
  private selectMode(next: CampaignMode, onRestart: () => void): void {
    if (next === this.mode) return;
    this.mode = next;
    try { localStorage.setItem(MODE_KEY, next); }
    catch { this.report = '出击模式只在当前页面有效：存储不可写。'; }
    onRestart();
    this.report = next === 'expedition'
      ? '已切换到三幕远征：九段、六次选卡、两次风险路线（迁移测试版）。'
      : '已切换到五波封锁模式。';
    this.render();
  }
  createWorld(): PocWorld {
    this.settled = false;
    this.lastSavedFingerprint = '';
    const viewport = mobileViewport(450, 800);
    const restore = this.nextRestore;
    this.nextRestore = null;
    if (restore) {
      const resumed = PocWorld.fromSafeSnapshot(restore,
        viewport.worldWidth, viewport.worldHeight);
      if (resumed) {
        this.currentRunId = resumed.runId;
        return resumed;
      }
      this.report = '安全节点校验失败，已改为全新出击。';
    }
    const meta = readMetaProgress(storage);
    const world = new PocWorld(viewport.worldWidth, viewport.worldHeight,
      newRunSeed(), this.zone, {
      armorRank: meta?.armorRank ?? 0,
      weaponFrameRank: meta?.weaponFrameRank ?? 0,
      repairModuleRank: meta?.repairModuleRank ?? 0,
    }, this.heroId, this.mode);
    this.currentRunId = world.runId;
    return world;
  }
  persistSafeNode(world: PocWorld): boolean {
    const save = world.safeSnapshot();
    if (!save) return false;
    const signature = JSON.stringify({ ...save, savedAtMs: 0 });
    if (signature === this.lastSavedFingerprint) return true;
    if (!writeRunSafeSave(storage, save)) {
      this.report = '安全节点写入失败：请检查浏览器本地存储权限。';
      return false;
    }
    this.lastSavedFingerprint = signature;
    return true;
  }
  settleIfOver(world: PocWorld): void {
    this.persistSafeNode(world);
    if (!world.state.over || this.settled) return;
    this.settled = true;
    const s = world.state;
    const result = settleStoredRun(storage, {
      runId: this.currentRunId, campaignId: s.campaignId,
      completedStages: Math.max(0, s.wave - 1 + Number(s.won)),
      kills: s.kills, elapsedMs: Math.floor(s.elapsedMs),
      victory: s.won, zoneId: this.zone,
    });
    if (result) {
      const saved = readRunSafeSave(storage);
      if (saved?.runId === this.currentRunId) clearRunSafeSave(storage);
    }
    if (result?.newSettlement) {
      this.report = '本局获得战备 +' + result.earned + '、'
        + getBattlefield(this.zone).resourceName + ' +' + result.materialEarned + '。';
    } else if (result && !result.newSettlement) {
      this.report = '本局奖励已领取，没有重复结算。';
    } else {
      this.report = '存档不可写，奖励未能保存；请检查浏览器存储权限。';
    }
    this.render();
  }
  private purchase(item: EquipmentId | 'armor'): void {
    const result = item === 'armor' ? purchaseStoredArmor(storage) : purchaseStoredEquipment(storage, item);
    if (result === null) this.report = '存档不可读或写入失败，未执行购买。';
    else this.report = result.bought ? '工坊强化成功！下一局出击生效。' : '尚未满足升级所需的材料或已达到等级上限。';
    this.render();
  }
  private rankAndCost(meta: MetaProgress, item: EquipmentId | 'armor'): { rank: number; label: string; possible: boolean } {
    if (item === 'armor') {
      const cost = nextArmorCost(meta);
      return { rank: meta.armorRank, label: cost === null ? 'MAX' : cost + ' 战备', possible: cost !== null && meta.warData >= cost };
    }
    const rank = item === 'weapon-frame' ? meta.weaponFrameRank : meta.repairModuleRank;
    const cost = nextEquipmentCost(meta, item);
    return { rank, label: cost === null ? 'MAX' : cost.warData + ' 战备 + ' + cost.quantity + (cost.material === 'alloy' ? ' 合金' : ' 样本'),
      possible: cost !== null && meta.warData >= cost.warData && meta[cost.material] >= cost.quantity };
  }
  private render(): void {
    const meta = readMetaProgress(storage);
    const shown = meta ?? newMetaProgress();
    for (const zone of BATTLEFIELDS) {
      const button = el<HTMLButtonElement>(zone.id === 'steel-ruins' ? 'zone-steel' : 'zone-nest');
      button.classList.toggle('active', this.zone === zone.id);
      button.setAttribute('aria-pressed', String(this.zone === zone.id));
    }
    for (const mode of ['prototype', 'expedition'] as const) {
      const button = el<HTMLButtonElement>('mode-' + mode);
      button.classList.toggle('active', this.mode === mode);
      button.setAttribute('aria-pressed', String(this.mode === mode));
    }
    const savedRun = readRunSafeSave(storage);
    const resume = el<HTMLButtonElement>('resume-expedition');
    resume.disabled = !savedRun;
    resume.textContent = savedRun ? '继续远征 · 第 ' + (savedRun.campaign.stageIndex + 1)
      + ' 段 · ' + (savedRun.campaign.phase === 'reward' ? '待选奖励' : '战斗准备')
      : '继续远征 · 暂无安全节点';
    el('mode-current').textContent = this.mode === 'expedition'
      ? '当前模式：三幕远征 · 九遭遇 · 六卡二路线'
      : '当前模式：五波封锁 · 四次波末选卡';
    for (const heroId of POC_PLAYABLE_HEROES) {
      const button = el<HTMLButtonElement>('hero-' + heroId);
      button.classList.toggle('active', this.heroId === heroId);
      button.setAttribute('aria-pressed', String(this.heroId === heroId));
    }
    el('hero-current').textContent = '当前英雄：' + POC_CATALOG.heroes.get(this.heroId)!.name;
    el('zone-current').textContent = '当前战区：' + getBattlefield(this.zone).name
      + ' · ' + getBattlefield(this.zone).enemyTrait;
    el('balance-war').textContent = String(shown.warData);
    el('balance-alloy').textContent = String(shown.alloy);
    el('balance-samples').textContent = String(shown.samples);
    for (const [item, buttonId, rankId] of [
      ['armor', 'buy-armor', 'rank-armor'],
      ['weapon-frame', 'buy-frame', 'rank-frame'],
      ['repair-module', 'buy-repair', 'rank-repair'],
    ] as const) {
      const state = this.rankAndCost(shown, item);
      el(rankId).textContent = 'Lv.' + state.rank + ' · ' + state.label;
      el<HTMLButtonElement>(buttonId).disabled = !meta || !state.possible;
    }
    el('ops-message').textContent = meta ? this.report : '存档数据校验失败，请勿清理历史记录后重试。';
  }
}
