/** Local-only M6.0c economy: a small permanent armor upgrade and deterministic run rewards.
 * No login, network, or meta currency duplication with per-run XP.
 */
export const META_STORAGE_KEY = 'endless-swarm-meta-v1';
export const MAX_ARMOR_RANK = 3;
export const ARMOR_COSTS = [25, 55, 100] as const;
export interface MetaProgress {
  readonly schemaVersion: 1;
  readonly warData: number;
  readonly armorRank: number;
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
}
export interface Settlement {
  readonly meta: MetaProgress;
  readonly earned: number;
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
  ({ schemaVersion: 1, warData: 0, armorRank: 0, settledRuns: [] });

export function parseMetaProgress(raw: unknown): MetaProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Partial<MetaProgress>;
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.warData) || data.warData! < 0
    || data.warData! > 100000000 || !Number.isInteger(data.armorRank)
    || data.armorRank! < 0 || data.armorRank! > MAX_ARMOR_RANK
    || !Array.isArray(data.settledRuns) || data.settledRuns.length > 50000
    || data.settledRuns.some((id: unknown) => typeof id !== 'string' || id.length < 8 || id.length > 128)
    || new Set(data.settledRuns).size !== data.settledRuns.length) return null;
  return { schemaVersion: 1, warData: data.warData!, armorRank: data.armorRank!,
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
  if (!parseMetaProgress(meta) || !/^[a-z0-9-]{8,128}$/.test(input.runId)
    || !/^[a-z0-9-]+$/.test(input.campaignId)) throw new Error('Invalid meta settlement');
  if (meta.settledRuns.includes(input.runId)) return { meta, earned: 0, newSettlement: false };
  const earned = calculateWarData(input);
  return {
    meta: { ...meta, warData: Math.min(100000000, meta.warData + earned),
      settledRuns: [...meta.settledRuns, input.runId] },
    earned, newSettlement: true,
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
