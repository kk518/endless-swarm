import type { RunSafeSave } from './runSafeSave.ts';

/**
 * Page boot may create an unsaved fresh world before the player can choose
 * "Resume". Never let that initial stage-0 world overwrite a recoverable run.
 * A different run may replace the old save only after reaching a real reward
 * node, or advancing to a later stage. This is storage-neutral domain policy.
 */
export function preservePreviousCheckpoint(
  existing: RunSafeSave | null, next: RunSafeSave,
): boolean {
  return existing !== null && existing.runId !== next.runId
    && next.campaign.phase === 'playing' && next.campaign.stageIndex === 0;
}
