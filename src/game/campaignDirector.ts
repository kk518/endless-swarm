import { WAVES, type WaveDef } from './progression.ts';

/**
 * Data-driven encounter director. The live 5-wave prototype remains the
 * default; the 3-act blueprint has no reward-route UI or stage content yet.
 */
export type EncounterKind = 'survival' | 'boss';
export type EncounterDecision = 'card' | 'route' | 'none';
export type CampaignPhase = 'playing' | 'reward' | 'victory' | 'timeout';

export interface EncounterDefinition {
  readonly id: string;
  readonly title: string;
  readonly kind: EncounterKind;
  readonly decision: EncounterDecision;
  /** The current legacy spawner still consumes this pressure/mix profile. */
  readonly wave: WaveDef;
  readonly pressureTier: number;
}
export interface ActDefinition {
  readonly id: string;
  readonly title: string;
  readonly encounters: readonly EncounterDefinition[];
}
export interface CampaignDefinition {
  readonly id: string;
  readonly title: string;
  readonly acts: readonly ActDefinition[];
}
export interface EncounterView {
  readonly actId: string;
  readonly actTitle: string;
  readonly actNumber: number;
  readonly encounter: EncounterDefinition;
  readonly index: number;
  readonly total: number;
}
export interface CampaignRunState {
  campaignId: string;
  seed: number;
  stageIndex: number;
  elapsedMs: number;
  phase: CampaignPhase;
}

export function encountersOf(campaign: CampaignDefinition): EncounterView[] {
  const total = campaign.acts.reduce((sum, act) => sum + act.encounters.length, 0);
  const result: EncounterView[] = [];
  for (const [actIndex, act] of campaign.acts.entries()) {
    for (const encounter of act.encounters) {
      result.push({ actId: act.id, actTitle: act.title, actNumber: actIndex + 1,
        encounter, index: result.length, total });
    }
  }
  return result;
}

/** Reject malformed content before it can strand a run or offer an invalid reward. */
export function validateCampaign(campaign: CampaignDefinition): void {
  if (!/^[a-z][a-z0-9-]*$/.test(campaign.id) || campaign.acts.length === 0) {
    throw new Error('Campaign needs a valid id and at least one act');
  }
  const acts = new Set<string>(), encounters = new Set<string>();
  const all = encountersOf(campaign);
  if (all.length < 2) throw new Error('Campaign requires an encounter and a finale');
  for (const act of campaign.acts) {
    if (!/^[a-z][a-z0-9-]*$/.test(act.id) || acts.has(act.id) || !act.title.trim() || act.encounters.length === 0) {
      throw new Error(`Invalid act: ${act.id}`);
    }
    acts.add(act.id);
    for (const item of act.encounters) {
      if (!/^[a-z][a-z0-9-]*$/.test(item.id) || encounters.has(item.id) || !item.title.trim()) {
        throw new Error(`Invalid encounter: ${item.id}`);
      }
      encounters.add(item.id);
      if (!Number.isInteger(item.pressureTier) || item.pressureTier < 1 || item.pressureTier > 5
        || !Number.isFinite(item.wave.durationMs) || item.wave.durationMs <= 0
        || !Number.isFinite(item.wave.spawnIntervalMs) || item.wave.spawnIntervalMs <= 0
        || !Number.isInteger(item.wave.maxEnemies) || item.wave.maxEnemies < 1
        || item.wave.mix.length === 0 || item.wave.mix.some(m => m.weight <= 0 || !Number.isFinite(m.weight))) {
        throw new Error(`Invalid encounter pacing: ${item.id}`);
      }
    }
  }
  for (const [index, view] of all.entries()) {
    const final = index === all.length - 1;
    if (final !== (view.encounter.kind === 'boss') || final !== (view.encounter.decision === 'none')) {
      throw new Error('Only the final encounter may be a boss without a reward');
    }
  }
}

export function getEncounter(campaign: CampaignDefinition, index: number): EncounterView {
  const stage = encountersOf(campaign)[index];
  if (!stage) throw new Error(`Unknown campaign encounter index: ${index}`);
  return stage;
}

export function beginCampaign(campaign: CampaignDefinition, seed: number): CampaignRunState {
  validateCampaign(campaign);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid run seed');
  return { campaignId: campaign.id, seed, stageIndex: 0, elapsedMs: 0, phase: 'playing' };
}

/** No DOM or Phaser; the caller chooses how to display a stage decision. */
export function tickCampaign(
  campaign: CampaignDefinition, state: CampaignRunState, deltaMs: number, bossKilled = false,
): CampaignRunState {
  if (state.campaignId !== campaign.id) throw new Error('Run belongs to another campaign');
  if (state.phase !== 'playing') return state;
  const stage = getEncounter(campaign, state.stageIndex).encounter;
  const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  const elapsedMs = state.elapsedMs + delta;
  if (stage.kind === 'boss') {
    return { ...state, elapsedMs,
      phase: bossKilled ? 'victory' : elapsedMs >= stage.wave.durationMs ? 'timeout' : 'playing' };
  }
  return { ...state, elapsedMs,
    phase: elapsedMs >= stage.wave.durationMs ? 'reward' : 'playing' };
}

/** A reward cannot be claimed twice and cannot advance from the final boss. */
export function advanceCampaignReward(campaign: CampaignDefinition, state: CampaignRunState): CampaignRunState {
  if (state.campaignId !== campaign.id || state.phase !== 'reward') throw new Error('No pending stage reward');
  if (state.stageIndex >= encountersOf(campaign).length - 1) throw new Error('Cannot advance beyond finale');
  return { ...state, stageIndex: state.stageIndex + 1, elapsedMs: 0, phase: 'playing' };
}

/** Serializable, explicit schema for later safe-node snapshot support. */
export interface CampaignCheckpoint {
  schemaVersion: 1;
  campaignId: string;
  stageIndex: number;
  elapsedMs: number;
  phase: CampaignPhase;
  seed: number;
}
export function toCheckpoint(state: CampaignRunState): CampaignCheckpoint {
  return { schemaVersion: 1, campaignId: state.campaignId, stageIndex: state.stageIndex,
    elapsedMs: state.elapsedMs, phase: state.phase, seed: state.seed };
}
export function fromCheckpoint(campaign: CampaignDefinition, value: unknown): CampaignRunState | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Partial<CampaignCheckpoint>;
  if (s.schemaVersion !== 1 || s.campaignId !== campaign.id
    || !Number.isSafeInteger(s.seed) || (s.seed as number) < 0 || (s.seed as number) > 0xffffffff
    || !Number.isInteger(s.stageIndex) || (s.stageIndex as number) < 0
    || (s.stageIndex as number) >= encountersOf(campaign).length
    || !Number.isFinite(s.elapsedMs) || (s.elapsedMs as number) < 0
    || !['playing', 'reward', 'victory', 'timeout'].includes(s.phase ?? '')) return null;
  const state: CampaignRunState = { campaignId: campaign.id, stageIndex: s.stageIndex!,
    elapsedMs: s.elapsedMs!, seed: s.seed!, phase: s.phase! };
  const view = getEncounter(campaign, state.stageIndex);
  if (state.phase === 'reward' && view.encounter.kind === 'boss') return null;
  if ((state.phase === 'victory' || state.phase === 'timeout') && view.encounter.kind !== 'boss') return null;
  return state;
}

function stage(id: string, title: string, pressureTier: number, durationMs: number,
  decision: EncounterDecision, boss = false): EncounterDefinition {
  const reference = WAVES[Math.min(4, pressureTier - 1)];
  return { id, title, kind: boss ? 'boss' : 'survival', decision, pressureTier,
    wave: { ...reference, durationMs } };
}

/** The active game is unchanged: four wave rewards then one final boss. */
export const PROTOTYPE_CAMPAIGN: CampaignDefinition = {
  id: 'k09-prototype',
  title: 'K-09 前线封锁',
  acts: [
    { id: 'landing', title: '前沿登陆', encounters: [
      stage('wave-1', '虫群初袭', 1, WAVES[0].durationMs, 'card'),
      stage('wave-2', '跃袭警报', 2, WAVES[1].durationMs, 'card'),
    ] },
    { id: 'pressure', title: '封锁加剧', encounters: [
      stage('wave-3', '装甲裂隙', 3, WAVES[2].durationMs, 'card'),
      stage('wave-4', '污染蔓延', 4, WAVES[3].durationMs, 'card'),
    ] },
    { id: 'finale', title: '虫巢决战', encounters: [
      stage('wave-5', '首领战', 5, WAVES[4].durationMs, 'none', true),
    ] },
  ],
};

/**
 * Content blueprint only. Do NOT select it in GameScene until route decisions,
 * encounter events, rewards and safe-node restoration are implemented.
 * 980 seconds of planned combat, excluding player-driven choice time.
 */
export const THREE_ACT_BLUEPRINT: CampaignDefinition = {
  id: 'k09-three-act-draft',
  title: 'K-09 虫巢远征（规划）',
  acts: [
    { id: 'act-1', title: '第一幕 · 登陆', encounters: [
      stage('landing', '降落区', 1, 100000, 'card'),
      stage('breakthrough', '突破防线', 2, 105000, 'route'),
      stage('vanguard-elite', '先遣精英', 3, 110000, 'card'),
    ] },
    { id: 'act-2', title: '第二幕 · 深入', encounters: [
      stage('suppression', '污染压制', 3, 105000, 'card'),
      stage('fork', '巢穴分岔', 3, 110000, 'route'),
      stage('middle-elite', '核心精英', 4, 110000, 'card'),
    ] },
    { id: 'act-3', title: '第三幕 · 终局', encounters: [
      stage('gathering', '虫群集结', 4, 105000, 'card'),
      stage('pre-boss', '终局整备', 5, 95000, 'card'),
      stage('hive-overlord', '虫巢统领', 5, 140000, 'none', true),
    ] },
  ],
};
