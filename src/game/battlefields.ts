import type { WaveDef, EnemyKind } from './progression.ts';

/**
 * Engine-neutral M6.1 battlefield catalog. No Phaser types, DOM or browser APIs.
 * More battlefields are additive: future entries need meaningful enemy rules,
 * a source material and appropriate workshop sinks.
 */
export type BattlefieldId = 'steel-ruins' | 'infested-nest';
export type MaterialId = 'alloy' | 'samples';
export interface BattlefieldDefinition {
  readonly id: BattlefieldId;
  readonly name: string;
  readonly description: string;
  readonly enemyTrait: string;
  readonly resource: MaterialId;
  readonly resourceName: string;
  readonly workshopTarget: string;
  readonly riskLabel: string;
}
export const BATTLEFIELDS: readonly BattlefieldDefinition[] = Object.freeze([
  Object.freeze({
    id: 'steel-ruins', name: '钢铁遗迹', description: '废弃军械工厂，装甲虫更密集，适合获取军用合金。',
    enemyTrait: '装甲虫增援', resource: 'alloy', resourceName: '军用合金',
    workshopTarget: '主武器框架', riskLabel: '中等威胁 · 重装虫群',
  }),
  Object.freeze({
    id: 'infested-nest', name: '感染巢穴', description: '活体菌毯巢穴，跃袭虫与自爆虫活跃，产出生体样本。',
    enemyTrait: '跃袭与爆破', resource: 'samples', resourceName: '生体样本',
    workshopTarget: '装甲修复模块', riskLabel: '高机动威胁 · 自爆虫',
  }),
]);
export const DEFAULT_BATTLEFIELD: BattlefieldId = 'steel-ruins';
export function isBattlefieldId(value: unknown): value is BattlefieldId {
  return value === 'steel-ruins' || value === 'infested-nest';
}
export function getBattlefield(id: BattlefieldId): BattlefieldDefinition {
  const result = BATTLEFIELDS.find(zone => zone.id === id);
  if (!result) throw new Error(`Unknown battlefield: ${id}`);
  return result;
}

/**
 * Rebalances existing enemy types, using the current stage's normal unit cap
 * and spawn rate. No unavailable art or enemy type is silently introduced.
 */
export function battlefieldWave(zoneId: BattlefieldId, base: WaveDef): WaveDef {
  const scale: Partial<Record<EnemyKind, number>> = zoneId === 'steel-ruins'
    ? { armored: 2.2, grunt: 1.15, leaper: 0.85, bomber: 0.75 }
    : { leaper: 1.55, bomber: 1.7, grunt: 1.1, armored: 0.65 };
  return {
    ...base,
    mix: base.mix.map(item => ({
      kind: item.kind,
      weight: item.weight * (scale[item.kind] ?? 1),
    })),
  };
}

export interface MaterialPayout {
  readonly zoneId: BattlefieldId;
  readonly completedStages: number;
  readonly kills: number;
  readonly elapsedMs: number;
  readonly victory: boolean;
}
/** Gated with the same 30s+5 kills threshold as universal war data. */
export function calculateBattlefieldMaterials(input: MaterialPayout): number {
  if (!isBattlefieldId(input.zoneId) || !Number.isFinite(input.elapsedMs)
    || input.elapsedMs < 30000 || !Number.isInteger(input.kills) || input.kills < 5
    || !Number.isInteger(input.completedStages) || input.completedStages < 0) return 0;
  // Balanced for the nine-stage experiment, independent of a future third map.
  return 4 + Math.min(9, input.completedStages) * 3
    + Math.min(6, Math.floor(input.kills / 40)) + (input.victory ? 12 : 0);
}
