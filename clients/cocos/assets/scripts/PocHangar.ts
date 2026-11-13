/**
 * M6.1a Creator-only hangar bridge. No cc/Phaser/DOM imports: mockable in Node.
 * Uses the canonical main metaProgression and battlefield rules, but NEVER
 * reads/writes the original Phaser or the Canvas preview's storage keys.
 */
import {
  readMetaProgress, settleStoredRun, purchaseStoredArmor, purchaseStoredEquipment,
  nextArmorCost, nextEquipmentCost, type EquipmentId, type MetaProgress,
  type Settlement, type MetaStorage,
} from './m6/metaProgression.ts';
import {
  DEFAULT_BATTLEFIELD, getBattlefield, isBattlefieldId, type BattlefieldId,
} from './m6/battlefields.ts';
import { getStoragePort, type GameStoragePort } from './m6/platformStorage.ts';
import { readRunSafeSave, clearRunSafeSave, type SafeRunStorage } from './m6/runSafeSave.ts';
import { newRunSeed } from './m6/runRandom.ts';
import { PocWorld } from './PocWorld.ts';
import type { PocHeroId } from './PocRoster.ts';
import type { CampaignMode } from './m6/runController.ts';

export const CREATOR_STORAGE_PREFIX = 'cocos-creator-m6:';
const ZONE_KEY = 'selected-battlefield';

export type WorkshopItem = EquipmentId | 'armor';
export interface HangarDisplay {
  readonly zoneId: BattlefieldId;
  readonly zoneName: string;
  readonly meta: MetaProgress | null;
  readonly message: string;
  readonly armorCost: number | null;
  readonly frameCost: ReturnType<typeof nextEquipmentCost>;
  readonly repairCost: ReturnType<typeof nextEquipmentCost>;
}
function prefixPort(port: GameStoragePort | null): MetaStorage & SafeRunStorage {
  return {
    getItem(key: string): string | null {
      if (!port) throw new Error('Creator storage port unavailable');
      return port.getItem(CREATOR_STORAGE_PREFIX + key);
    },
    setItem(key: string, value: string): void {
      if (!port) throw new Error('Creator storage port unavailable');
      port.setItem(CREATOR_STORAGE_PREFIX + key, value);
    },
    removeItem(key: string): void {
      if (!port) throw new Error('Creator storage port unavailable');
      port.removeItem(CREATOR_STORAGE_PREFIX + key);
    },
  };
}

export class CreatorHangar {
  private readonly storage: MetaStorage & SafeRunStorage;
  private zone: BattlefieldId = DEFAULT_BATTLEFIELD;
  private settledRun: string | null = null;
  private report = '选择战区和装备；新购装备仅在下一局生效。';

  constructor(port: GameStoragePort | null = getStoragePort()) {
    this.storage = prefixPort(port);
    try {
      const selected = this.storage.getItem(ZONE_KEY);
      if (isBattlefieldId(selected)) this.zone = selected;
    } catch { this.report = '本机存储不可用，暂无法保存材料和装备。'; }
  }

  get zoneId(): BattlefieldId { return this.zone; }
  get message(): string { return this.report; }

  display(): HangarDisplay {
    const meta = readMetaProgress(this.storage);
    return {
      zoneId: this.zone,
      zoneName: getBattlefield(this.zone).name,
      meta, message: this.report,
      armorCost: meta ? nextArmorCost(meta) : null,
      frameCost: meta ? nextEquipmentCost(meta, 'weapon-frame') : null,
      repairCost: meta ? nextEquipmentCost(meta, 'repair-module') : null,
    };
  }

  chooseZone(id: BattlefieldId): boolean {
    if (!isBattlefieldId(id)) return false;
    this.zone = id;
    try { this.storage.setItem(ZONE_KEY, id); }
    catch { this.report = '战区已切换；本机存储不可写，重启后选择可能丢失。'; return true; }
    this.report = '下一次出战：' + getBattlefield(id).name + '。';
    return true;
  }

  /** Capture all owned equipment at launch; purchases cannot upgrade this run. */
  launch(width: number, height: number, hero: PocHeroId, mode: CampaignMode,
    seed = newRunSeed()): PocWorld {
    const meta = readMetaProgress(this.storage);
    this.settledRun = null;
    this.report = '出击战区：' + getBattlefield(this.zone).name + '。';
    return new PocWorld(width, height, seed, this.zone, {
      armorRank: meta?.armorRank ?? 0,
      weaponFrameRank: meta?.weaponFrameRank ?? 0,
      repairModuleRank: meta?.repairModuleRank ?? 0,
    }, hero, mode);
  }

  /** A valid checkpoint owns its original runId, region and equipment snapshot. */
  restore(width: number, height: number): PocWorld | null {
    const snapshot = readRunSafeSave(this.storage);
    if (!snapshot) { this.report = '当前没有可恢复的安全节点。'; return null; }
    const world = PocWorld.fromSafeSnapshot(snapshot, width, height);
    if (!world) { this.report = '安全节点校验失败，没有覆盖原存档。'; return null; }
    this.zone = snapshot.battlefieldId;
    this.settledRun = null;
    this.report = '已恢复' + getBattlefield(this.zone).name + '第'
      + (snapshot.campaign.stageIndex + 1) + '段，保留原装备快照。';
    return world;
  }

  /** Atomic canonical settlement with persistent runId ledger. Retries on write failure. */
  settle(world: PocWorld): Settlement | null {
    if (!world.state.over || this.settledRun === world.runId) return null;
    const state = world.state;
    const result = settleStoredRun(this.storage, {
      runId: world.runId, campaignId: state.campaignId,
      completedStages: Math.max(0, state.wave - 1 + Number(state.won)),
      kills: state.kills, elapsedMs: Math.floor(state.elapsedMs),
      victory: state.won, zoneId: world.zoneId,
    });
    if (!result) {
      this.report = '结算无法写入本机存储，奖励尚未保存。';
      return null;
    }
    this.settledRun = world.runId;
    // Clear only this run's safe save, and ONLY after settlement is durable.
    const checkpoint = readRunSafeSave(this.storage);
    if (checkpoint?.runId === world.runId) clearRunSafeSave(this.storage);
    this.report = result.newSettlement
      ? '获得战备 +' + result.earned + '、'
        + getBattlefield(world.zoneId).resourceName + ' +' + result.materialEarned
        + '。工坊购买将在下一局生效。'
      : '本局已结算，不能重复领取资源。';
    return result;
  }

  purchase(item: WorkshopItem): boolean {
    const result = item === 'armor'
      ? purchaseStoredArmor(this.storage)
      : purchaseStoredEquipment(this.storage, item);
    if (!result) { this.report = '存储不可用或购买未能写入；资源未确认扣除。'; return false; }
    this.report = result.bought
      ? '装备升级成功，下次出击生效。'
      : '资源不足或已达到工坊升级上限。';
    return result.bought;
  }
}
