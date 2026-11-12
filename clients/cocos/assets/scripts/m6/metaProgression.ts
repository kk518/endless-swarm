/** Local-only M6.0c economy: a small permanent armor upgrade and deterministic run rewards.
 * No login, network, or meta currency duplication with per-run XP.
 */
import { DEFAULT_BATTLEFIELD, calculateBattlefieldMaterials, getBattlefield,
  isBattlefieldId, type BattlefieldId, type MaterialId } from './battlefields.ts';

export const META_STORAGE_KEY = 'endless-swarm-meta-v1';
/** Keep the existing key; read v1 saves and migrate on the next successful write. */
export const FRAME_COSTS = [{ warData: 8, alloy: 12 }, { warData: 16, alloy: 20 }] as const;
export const REPAIR_COSTS = [{ warData: 8, samples: 12 }, { warData: 14, samples: 18 }] as const;
export const MAX_EQUIPMENT_RANK = 2;
export type EquipmentId = 'weapon-frame' | 'repair-module';
export const MAX_ARMOR_RANK = 3;
export const ARMOR_COSTS = [25, 55, 100] as const;
export interface MetaProgress {
  readonly schemaVersion: 2;
  readonly warData: number;
  readonly alloy: number;
  readonly samples: number;
  readonly armorRank: number;
  readonly weaponFrameRank: number;
  readonly repairModuleRank: number;
  /** Idempotency ledger. Kept indefinitely at this prototype scale. */
  readonly settledRuns: readonly string[];
}
export interface RunPayout {
  readonly runId: string;
  readonly campaignId: string;
  readonly completedStages: number;
  readonly kills: number;
  readonly elapsedMs: number;
  readonly victory: boolean;
  readonly zoneId?: BattlefieldId; // old M6.0c callers default to steel ruins
}
export interface Settlement {
  readonly meta: MetaProgress;
  readonly earned: number;
  readonly materialEarned: number;
  readonly materialId: MaterialId;
  readonly newSettlement: boolean;
}
export interface Purchase {
  readonly meta: MetaProgress;
  readonly bought: boolean;
  readonly cost: number;
}
export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const newMetaProgress = (): MetaProgress =>
  ({ schemaVersion: 2, warData: 0, alloy: 0, samples: 0, armorRank: 0,
    weaponFrameRank: 0, repairModuleRank: 0, settledRuns: [] });

export function parseMetaProgress(raw: unknown): MetaProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if ((data.schemaVersion !== 1 && data.schemaVersion !== 2)
    || !Number.isSafeInteger(data.warData) || (data.warData as number) < 0
    || (data.warData as number) > 100000000 || !Number.isInteger(data.armorRank)
    || (data.armorRank as number) < 0 || (data.armorRank as number) > MAX_ARMOR_RANK
    || !Array.isArray(data.settledRuns) || data.settledRuns.length > 50000
    || data.settledRuns.some((id: unknown) => typeof id !== 'string' || id.length < 8 || id.length > 128)
    || new Set(data.settledRuns).size !== data.settledRuns.length) return null;
  const prior = data.schemaVersion === 1;
  const alloy = prior ? 0 : data.alloy;
  const samples = prior ? 0 : data.samples;
  const weaponFrameRank = prior ? 0 : data.weaponFrameRank;
  const repairModuleRank = prior ? 0 : data.repairModuleRank;
  if (![alloy, samples].every(v => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 100000000)
    || ![weaponFrameRank, repairModuleRank].every(v =>
      Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_EQUIPMENT_RANK)) return null;
  return { schemaVersion: 2, warData: data.warData as number,
    alloy: alloy as number, samples: samples as number,
    armorRank: data.armorRank as number,
    weaponFrameRank: weaponFrameRank as number, repairModuleRank: repairModuleRank as number,
    settledRuns: [...data.settledRuns] };
}

export function readMetaProgress(storage: MetaStorage): MetaProgress | null {
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    return raw === null ? newMetaProgress() : parseMetaProgress(JSON.parse(raw));
  } catch { return null; }
}

export function saveMetaProgress(storage: MetaStorage, meta: MetaProgress): boolean {
  if (!parseMetaProgress(meta)) return false;
  try { storage.setItem(META_STORAGE_KEY, JSON.stringify(meta)); return true; }
  catch { return false; }
}

/** Sub-30-second failed starts provide no resources; real failed attempts do. */
export function calculateWarData(input: RunPayout): number {
  if (!Number.isFinite(input.elapsedMs) || input.elapsedMs < 30000
    || !Number.isInteger(input.kills) || input.kills < 5
    || !Number.isInteger(input.completedStages) || input.completedStages < 0) return 0;
  return 5 + Math.floor(Math.min(input.elapsedMs, 25 * 60000) / 60000) * 3
    + Math.min(24, input.completedStages) * 3 + Math.min(12, Math.floor(input.kills / 20))
    + (input.victory ? 20 : 0);
}

export function settleMetaProgress(meta: MetaProgress, input: RunPayout): Settlement {
  const zoneId = input.zoneId ?? DEFAULT_BATTLEFIELD;
  if (!parseMetaProgress(meta) || !/^[a-z0-9-]{8,128}$/.test(input.runId)
    || !/^[a-z0-9-]+$/.test(input.campaignId) || !isBattlefieldId(zoneId)
    || meta.settledRuns.length >= 50000) throw new Error('Invalid meta settlement');
  const materialId = getBattlefield(zoneId).resource;
  if (meta.settledRuns.includes(input.runId))
    return { meta, earned: 0, materialEarned: 0, materialId, newSettlement: false };
  const earned = calculateWarData(input);
  const materialEarned = calculateBattlefieldMaterials({
    zoneId, kills: input.kills, elapsedMs: input.elapsedMs,
    completedStages: input.completedStages, victory: input.victory,
  });
  return {
    meta: { ...meta,
      warData: Math.min(100000000, meta.warData + earned),
      [materialId]: Math.min(100000000, meta[materialId] + materialEarned),
      settledRuns: [...meta.settledRuns, input.runId] },
    earned, materialEarned, materialId, newSettlement: true,
  };
}

/** One localStorage write holds both balance and run ledger. */
export function settleStoredRun(storage: MetaStorage, input: RunPayout): Settlement | null {
  const before = readMetaProgress(storage);
  if (!before) return null;
  const result = settleMetaProgress(before, input);
  if (result.newSettlement && !saveMetaProgress(storage, result.meta)) return null;
  return result;
}

export function nextArmorCost(meta: MetaProgress): number | null {
  return meta.armorRank >= MAX_ARMOR_RANK ? null : ARMOR_COSTS[meta.armorRank];
}

export function purchaseArmor(meta: MetaProgress): Purchase {
  if (!parseMetaProgress(meta)) throw new Error('Invalid meta purchase');
  const cost = nextArmorCost(meta);
  if (cost === null || meta.warData < cost) return { meta, bought: false, cost: cost ?? 0 };
  return { meta: { ...meta, warData: meta.warData - cost, armorRank: meta.armorRank + 1 },
    bought: true, cost };
}
export function purchaseStoredArmor(storage: MetaStorage): Purchase | null {
  const meta = readMetaProgress(storage);
  if (!meta) return null;
  const result = purchaseArmor(meta);
  if (result.bought && !saveMetaProgress(storage, result.meta)) return null;
  return result;
}

/** Permanent two-slot workshop; rank 2 is the first M6.1 milestone cap. */
export interface EquipmentCost {
  readonly warData: number;
  readonly material: MaterialId;
  readonly quantity: number;
}
export interface EquipmentPurchase {
  readonly meta: MetaProgress;
  readonly bought: boolean;
  readonly cost: EquipmentCost | null;
}
export function nextEquipmentCost(meta: MetaProgress, item: EquipmentId): EquipmentCost | null {
  const rank = item === 'weapon-frame' ? meta.weaponFrameRank : meta.repairModuleRank;
  if (rank >= MAX_EQUIPMENT_RANK) return null;
  if (item === 'weapon-frame') {
    const c = FRAME_COSTS[rank];
    return { warData: c.warData, material: 'alloy', quantity: c.alloy };
  }
  const c = REPAIR_COSTS[rank];
  return { warData: c.warData, material: 'samples', quantity: c.samples };
}
export function purchaseEquipment(meta: MetaProgress, item: EquipmentId): EquipmentPurchase {
  if (!parseMetaProgress(meta) || !['weapon-frame', 'repair-module'].includes(item))
    throw new Error('Invalid equipment purchase');
  const cost = nextEquipmentCost(meta, item);
  if (!cost || meta.warData < cost.warData || meta[cost.material] < cost.quantity)
    return { meta, bought: false, cost };
  const field = item === 'weapon-frame' ? 'weaponFrameRank' : 'repairModuleRank';
  return { meta: { ...meta, warData: meta.warData - cost.warData,
    [cost.material]: meta[cost.material] - cost.quantity, [field]: meta[field] + 1 },
    bought: true, cost };
}
export function purchaseStoredEquipment(storage: MetaStorage, item: EquipmentId): EquipmentPurchase | null {
  const meta = readMetaProgress(storage);
  if (!meta) return null;
  const result = purchaseEquipment(meta, item);
  if (result.bought && !saveMetaProgress(storage, result.meta)) return null;
  return result;
}
