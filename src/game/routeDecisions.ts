/**
 * A route is a single explicit tactical decision at a safe encounter boundary.
 * Its pressure modifier affects the NEXT encounter only; damage is a run-only
 * reward. Nothing here writes persistent resources or unlocks.
 */
export type RouteRisk = 'safe' | 'hazard';
export interface RouteChoice {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly risk: RouteRisk;
  readonly hpDelta: number;
  readonly runDamageMultiplier: number;
  readonly nextPressureMultiplier: number;
}
export interface RouteEffect {
  readonly hp: number;
  readonly runDamageMultiplier: number;
  readonly nextPressureMultiplier: number;
}
const route = (id: string, name: string, description: string, icon: string, risk: RouteRisk,
  hpDelta: number, runDamageMultiplier: number, nextPressureMultiplier: number): RouteChoice =>
  Object.freeze({ id, name, description, icon, risk, hpDelta, runDamageMultiplier, nextPressureMultiplier });

export const FIRST_FORK_ROUTES: readonly RouteChoice[] = Object.freeze([
  route('landing-supply', '补给迂回', '修复 2 点装甲，按常规虫潮推进下一段。', '✚', 'safe', 2, 1, 1),
  route('landing-assault', '深入孵化线', '消耗 1 点装甲；本局火力 +15%，下一段增援速度 +25%。', '⚠', 'hazard', -1, 1.15, 1.25),
]);
export const SECOND_FORK_ROUTES: readonly RouteChoice[] = Object.freeze([
  route('hive-resupply', '稳固防线', '修复 2 点装甲，稳步清理虫巢外环。', '◇', 'safe', 2, 1, 1),
  route('hive-breach', '突入巢核', '消耗 1 点装甲；本局火力 +15%，下一段增援速度 +30%。', '✹', 'hazard', -1, 1.15, 1.3),
]);

export function validateRouteChoices(options: readonly RouteChoice[]): void {
  if (options.length < 2 || options.length > 3) throw new Error('Route fork needs 2–3 choices');
  const ids = new Set<string>();
  for (const option of options) {
    if (!/^[a-z][a-z0-9-]*$/.test(option.id) || ids.has(option.id)
      || !option.name.trim() || !option.description.trim() || !option.icon.trim()
      || !['safe', 'hazard'].includes(option.risk)
      || !Number.isInteger(option.hpDelta) || option.hpDelta < -3 || option.hpDelta > 4
      || !Number.isFinite(option.runDamageMultiplier) || option.runDamageMultiplier < 1
      || option.runDamageMultiplier > 1.5
      || !Number.isFinite(option.nextPressureMultiplier) || option.nextPressureMultiplier < 1
      || option.nextPressureMultiplier > 1.5) {
      throw new Error(`Invalid route choice: ${option.id}`);
    }
    ids.add(option.id);
  }
  if (!options.some(option => option.risk === 'safe' && option.hpDelta >= 0)) {
    throw new Error('Route fork needs a safe alternative');
  }
}

export function eligibleRouteChoices(options: readonly RouteChoice[], hp: number): RouteChoice[] {
  validateRouteChoices(options);
  if (!Number.isFinite(hp) || hp < 1) return [];
  return options.filter(option => hp + option.hpDelta >= 1);
}

/**
 * Select only from choices actually offered for the current encounter.
 * Keeping at least 1 HP prevents a route-click from killing a run off-screen.
 */
export function resolveRouteChoice(
  options: readonly RouteChoice[], chosenId: string, hp: number, maxHp: number,
): RouteEffect | null {
  if (!Number.isFinite(maxHp) || maxHp < 1 || !Number.isFinite(hp) || hp < 1 || hp > maxHp) return null;
  const chosen = eligibleRouteChoices(options, hp).find(option => option.id === chosenId);
  if (!chosen) return null;
  return {
    hp: Math.max(1, Math.min(maxHp, hp + chosen.hpDelta)),
    runDamageMultiplier: chosen.runDamageMultiplier,
    nextPressureMultiplier: chosen.nextPressureMultiplier,
  };
}
