/** M1 progression rules deliberately have no Phaser/DOM dependencies. */
export type WeaponId = 'rifle' | 'scatter' | 'arc' | 'flame';
export type EnemyKind = 'grunt' | 'leaper' | 'armored' | 'spitter' | 'bomber' | 'boss';
export type CardId =
  | 'scatter-kit' | 'arc-kit' | 'flame-kit' | 'feed' | 'warhead' | 'pierce'
  | 'chain-blast' | 'radius' | 'thrusters' | 'cryogenic' | 'afterglow'
  | 'fast-braces' | 'overload' | 'bulwark' | 'repair' | 'plating'
  | 'frenzy' | 'salvage' | 'critical-core'
  | 'supply-magnet' | 'surge-cell' | 'emp-array';

export interface WaveDef {
  number: number;
  durationMs: number;
  maxEnemies: number;
  spawnIntervalMs: number;
  mix: ReadonlyArray<{ kind: EnemyKind; weight: number }>;
}

export const WAVES: readonly WaveDef[] = [
  { number: 1, durationMs: 35000, maxEnemies: 42, spawnIntervalMs: 850, mix: [{ kind: 'grunt', weight: 1 }] },
  { number: 2, durationMs: 40000, maxEnemies: 57, spawnIntervalMs: 620, mix: [{ kind: 'grunt', weight: 4 }, { kind: 'leaper', weight: 1 }] },
  { number: 3, durationMs: 45000, maxEnemies: 70, spawnIntervalMs: 480, mix: [{ kind: 'grunt', weight: 5 }, { kind: 'leaper', weight: 2 }, { kind: 'armored', weight: 1 }, { kind: 'bomber', weight: 1 }] },
  { number: 4, durationMs: 50000, maxEnemies: 86, spawnIntervalMs: 390, mix: [{ kind: 'grunt', weight: 5 }, { kind: 'leaper', weight: 2 }, { kind: 'armored', weight: 2 }, { kind: 'spitter', weight: 1 }, { kind: 'bomber', weight: 1 }] },
  { number: 5, durationMs: 90000, maxEnemies: 95, spawnIntervalMs: 800, mix: [{ kind: 'grunt', weight: 6 }, { kind: 'leaper', weight: 2 }, { kind: 'spitter', weight: 1 }, { kind: 'bomber', weight: 2 }] },
] as const;

export interface CardDef {
  id: CardId;
  name: string;
  description: string;
  icon: string;
  category: 'weapon' | 'assault' | 'mobile' | 'deploy' | 'survival';
  weapon?: WeaponId;
}

export const CARDS: readonly CardDef[] = [
  { id: 'scatter-kit', name: '散射炮组件', description: '解锁近距离扇形散射炮', icon: '✦', category: 'weapon', weapon: 'scatter' },
  { id: 'arc-kit', name: '电弧线圈', description: '解锁连续跳跃的闪电链', icon: 'ϟ', category: 'weapon', weapon: 'arc' },
  { id: 'flame-kit', name: '喷火模块', description: '解锁前方持续范围火焰', icon: '♨', category: 'weapon', weapon: 'flame' },
  { id: 'feed', name: '高速供弹', description: '所有武器攻击频率 +25%（叠加生效）', icon: '➟', category: 'assault' },
  { id: 'warhead', name: '强化弹头', description: '所有武器伤害 +25%（叠加生效）', icon: '◆', category: 'assault' },
  { id: 'pierce', name: '穿甲弹', description: '电磁步枪与散射炮子弹额外穿透 1 只虫', icon: '⇢', category: 'assault' },
  { id: 'chain-blast', name: '连环爆裂', description: '击杀时有 22% 概率引发范围爆炸', icon: '✹', category: 'assault' },
  { id: 'radius', name: '扩散核心', description: '火焰、散射和电弧有效覆盖 +25%', icon: '◎', category: 'assault' },
  { id: 'thrusters', name: '磁悬浮推进', description: '移动速度 +22%', icon: '⟫', category: 'mobile' },
  { id: 'cryogenic', name: '冰霜弹头', description: '命中让虫族减速 30%，持续 1 秒', icon: '❄', category: 'mobile' },
  { id: 'afterglow', name: '战术余热', description: '离开展开后 1.2 秒内伤害仍 +15%', icon: '◐', category: 'mobile' },
  { id: 'fast-braces', name: '快速支架', description: '火力展开所需时间 -30%', icon: '⌁', category: 'deploy' },
  { id: 'overload', name: '超载反应堆', description: '展开期间射速额外 +40%，持续 3 秒后需移动冷却', icon: '✺', category: 'deploy' },
  { id: 'bulwark', name: '钢铁壁垒', description: '展开时有 40% 概率抵消一次伤害', icon: '▣', category: 'deploy' },
  { id: 'repair', name: '应急修复', description: '立即回复 3 点装甲生命', icon: '✚', category: 'survival' },
  { id: 'plating', name: '装甲加固', description: '最大生命 +2，并回复 2 点生命', icon: '⬡', category: 'survival' },
  { id: 'frenzy', name: '战斗狂热', description: '连杀伤害增幅每档从 10% 提升至 15%', icon: '✷', category: 'assault' },
  { id: 'salvage', name: '战地回收', description: '获得后每击杀 20 只虫恢复 1 点装甲', icon: '⚒', category: 'survival' },
  { id: 'critical-core', name: '弱点扫描', description: '每级增加 14% 双倍暴击概率，最高 42%', icon: '◈', category: 'assault' },
  { id: 'supply-magnet', name: '磁力回收臂', description: '移动速度 +10%，补给拾取范围 ×1.8', icon: '⊕', category: 'mobile' },
  { id: 'surge-cell', name: '聚变蓄能器', description: '常驻射速 +10%，超频持续时间延长至 13 秒', icon: '⚡', category: 'assault' },
  { id: 'emp-array', name: '脉冲阵列', description: '常驻伤害 +10%，EMP 伤害与半径提升', icon: '✺', category: 'assault' },
];

export interface RunBuild {
  weapons: WeaponId[];
  damage: number;
  rate: number;
  speed: number;
  range: number;
  pierce: number;
  explosionChance: number;
  frost: boolean;
  afterglow: boolean;
  deployDelay: number;
  overload: boolean;
  bulwark: boolean;
  frenzy: boolean;
  salvage: boolean;
  criticalChance: number;
  supplyMagnet: boolean;
  surgeCell: boolean;
  empArray: boolean;
  maxHp: number;
  hp: number;
  selected: CardId[];
}

export function newBuild(): RunBuild {
  return {
    weapons: ['rifle'], damage: 1, rate: 1, speed: 1, range: 1, pierce: 0,
    explosionChance: 0, frost: false, afterglow: false, deployDelay: 1,
    overload: false, bulwark: false, frenzy: false, salvage: false,
    criticalChance: 0, supplyMagnet: false, surgeCell: false, empArray: false,
    maxHp: 6, hp: 6, selected: [],
  };
}

export function eligibleCards(build: RunBuild): CardDef[] {
  return CARDS.filter(card => {
    if (card.weapon && (build.weapons.includes(card.weapon) || build.weapons.length >= 4)) return false;
    if (card.id === 'repair' && build.hp >= build.maxHp) return false;
    if (card.id === 'cryogenic' && build.frost) return false;
    if (card.id === 'afterglow' && build.afterglow) return false;
    if (card.id === 'overload' && build.overload) return false;
    if (card.id === 'bulwark' && build.bulwark) return false;
    if (card.id === 'frenzy' && build.frenzy) return false;
    if (card.id === 'supply-magnet' && build.supplyMagnet) return false;
    if (card.id === 'surge-cell' && build.surgeCell) return false;
    if (card.id === 'emp-array' && build.empArray) return false;
    if (card.id === 'salvage' && build.salvage) return false;
    if (card.id === 'critical-core' && build.criticalChance >= 0.42 - 1e-6) return false;
    if (card.id === 'chain-blast' && build.explosionChance >= 0.66) return false;
    return true;
  });
}

/** Three distinct, legal choices. Early rewards prominently offer a second weapon. */
export function rollCards(build: RunBuild, rewardNumber: number, random: () => number = Math.random): CardDef[] {
  const pool = eligibleCards(build);
  const chosen: CardDef[] = [];
  if (rewardNumber <= 2) {
    const newWeapons = pool.filter(card => card.weapon);
    if (newWeapons.length > 0) {
      const index = Math.min(newWeapons.length - 1, Math.floor(Math.max(0, random()) * newWeapons.length));
      chosen.push(newWeapons[index]);
    }
  }
  const remaining = pool.filter(card => !chosen.includes(card));
  if (rewardNumber <= 2) {
    // Early offers include at least one immediately visible and unconditional improvement.
    const reliable = remaining.filter(card =>
      ['feed', 'warhead', 'thrusters', 'plating', 'critical-core'].includes(card.id));
    if (reliable.length) {
      const index = Math.min(reliable.length - 1, Math.floor(Math.max(0, random()) * reliable.length));
      const card = reliable[index];
      chosen.push(card);
      remaining.splice(remaining.indexOf(card), 1);
    }
  }
  while (chosen.length < 3 && remaining.length) {
    const index = Math.min(remaining.length - 1, Math.floor(Math.max(0, random()) * remaining.length));
    chosen.push(remaining.splice(index, 1)[0]);
  }
  return chosen;
}

/** Applies one actual offered card, and never changes persistent/meta progression. */
export function applyCard(build: RunBuild, cardId: CardId): boolean {
  const card = CARDS.find(c => c.id === cardId);
  if (!card || !eligibleCards(build).some(c => c.id === cardId)) return false;
  if (card.weapon) build.weapons.push(card.weapon);
  switch (card.id) {
    case 'feed': build.rate *= 1.25; break;
    case 'warhead': build.damage *= 1.25; break;
    case 'pierce': build.pierce++; break;
    case 'chain-blast': build.explosionChance = Math.min(0.66, build.explosionChance + 0.22); break;
    case 'radius': build.range *= 1.25; break;
    case 'thrusters': build.speed *= 1.22; break;
    case 'cryogenic': build.frost = true; break;
    case 'afterglow': build.afterglow = true; break;
    case 'fast-braces': build.deployDelay *= 0.7; break;
    case 'overload': build.overload = true; break;
    case 'bulwark': build.bulwark = true; break;
    case 'repair': build.hp = Math.min(build.maxHp, build.hp + 3); break;
    case 'plating': build.maxHp += 2; build.hp = Math.min(build.maxHp, build.hp + 2); break;
    case 'frenzy': build.frenzy = true; break;
    case 'salvage': build.salvage = true; break;
    case 'critical-core': build.criticalChance = Math.min(0.42, build.criticalChance + 0.14); break;
    case 'supply-magnet': build.supplyMagnet = true; build.speed *= 1.1; break;
    case 'surge-cell': build.surgeCell = true; build.rate *= 1.1; break;
    case 'emp-array': build.empArray = true; build.damage *= 1.1; break;
  }
  build.selected.push(cardId);
  return true;
}

export function pickEnemyKind(wave: WaveDef, random: () => number = Math.random): EnemyKind {
  const total = wave.mix.reduce((sum, item) => sum + item.weight, 0);
  let choice = Math.max(0, random()) * total;
  for (const item of wave.mix) {
    choice -= item.weight;
    if (choice < 0) return item.kind;
  }
  return wave.mix[wave.mix.length - 1].kind;
}

/** A run is won only by killing the fifth-wave boss. */
export function nextPhase(waveNumber: number, bossKilled: boolean, elapsedMs: number): 'playing' | 'reward' | 'victory' | 'timeout' {
  const wave = WAVES[waveNumber - 1];
  if (!wave) return 'timeout';
  if (waveNumber === 5) return bossKilled ? 'victory' : elapsedMs >= wave.durationMs ? 'timeout' : 'playing';
  return elapsedMs >= wave.durationMs ? 'reward' : 'playing';
}
