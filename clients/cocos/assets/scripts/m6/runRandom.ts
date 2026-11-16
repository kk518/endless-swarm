/**
 * Domain-separated deterministic random streams. Cosmetic particles cannot
 * affect encounter/loot rolls; a run can record each stream's position for
 * a future safe-node checkpoint. Not a security or anti-cheat mechanism.
 */
export interface RandomStream {
  next(): number;
  snapshot(): number;
  restore(state: number): void;
}
export interface RunRandomStreams {
  readonly combat: RandomStream;
  readonly rewards: RandomStream;
  readonly events: RandomStream;
  readonly visuals: RandomStream;
}
export interface RandomCheckpoint {
  combat: number;
  rewards: number;
  events: number;
  visuals: number;
}

function normalizeSeed(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid RNG seed');
  return (value >>> 0) || 0x6d2b79f5;
}

/** Xorshift32; never initializes an all-zero stream. */
export function createRandomStream(seed: number): RandomStream {
  let state = normalizeSeed(seed);
  return {
    next(): number {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x100000000;
    },
    snapshot(): number { return state >>> 0; },
    restore(nextState: number): void {
      if (!Number.isSafeInteger(nextState) || nextState <= 0 || nextState > 0xffffffff) {
        throw new Error('Invalid RNG checkpoint state');
      }
      state = nextState >>> 0;
    },
  };
}

/** Derive a stream-specific nonzero seed without consuming another stream. */
export function deriveStreamSeed(runSeed: number, purpose: string): number {
  let hash = 2166136261 ^ normalizeSeed(runSeed);
  for (let i = 0; i < purpose.length; i++) {
    hash = Math.imul(hash ^ purpose.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) || 0x9e3779b9;
}

export function createRunRandoms(runSeed: number): RunRandomStreams {
  return {
    combat: createRandomStream(deriveStreamSeed(runSeed, 'combat')),
    rewards: createRandomStream(deriveStreamSeed(runSeed, 'rewards')),
    events: createRandomStream(deriveStreamSeed(runSeed, 'events')),
    visuals: createRandomStream(deriveStreamSeed(runSeed, 'visuals')),
  };
}
export function snapshotRandoms(streams: RunRandomStreams): RandomCheckpoint {
  return {
    combat: streams.combat.snapshot(),
    rewards: streams.rewards.snapshot(),
    events: streams.events.snapshot(),
    visuals: streams.visuals.snapshot(),
  };
}
export function restoreRandoms(streams: RunRandomStreams, snapshot: RandomCheckpoint): void {
  const values = [snapshot.combat, snapshot.rewards, snapshot.events, snapshot.visuals];
  if (values.some(value => !Number.isSafeInteger(value) || value <= 0 || value > 0xffffffff)) {
    throw new Error('Invalid RNG checkpoint');
  }
  streams.combat.restore(snapshot.combat);
  streams.rewards.restore(snapshot.rewards);
  streams.events.restore(snapshot.events);
  streams.visuals.restore(snapshot.visuals);
}

/** Only once per new run; all subsequent game random draws use stable streams. */
export function newRunSeed(): number {
  return ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}
