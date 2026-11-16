/**
 * Renderer-neutral player motion sampling for an eight-frame AI art atlas.
 * 0..3 = idle; 4..7 = locomotion. Only reads positions and simulation time.
 * Does not alter collision, attacks, save state or RNG.
 */
export interface MechMotionPoint { readonly x: number; readonly y: number }
export class MechMotionSampler {
  private previous: MechMotionPoint | null = null;
  private lastTimeMs = -1;
  private runUntilMs = 0;
  private orientation: -1 | 1 = 1;
  private locomoting = false;

  /** Mirror only the hero sprite, never the independent weapon hardpoints. */
  facing(): -1 | 1 { return this.orientation; }
  running(): boolean { return this.locomoting; }

  reset(): void {
    this.previous = null;
    this.lastTimeMs = -1;
    this.runUntilMs = 0;
    this.orientation = 1;
    this.locomoting = false;
  }

  frame(position: MechMotionPoint, elapsedMs: number, alive = true): number {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
      || !Number.isFinite(elapsedMs)) {
      this.reset();
      return 0;
    }
    const time = Math.max(0, elapsedMs);
    if (time < this.lastTimeMs) this.reset();
    if (alive && this.previous) {
      const dx = position.x - this.previous.x;
      const dy = position.y - this.previous.y;
      if (Math.hypot(dx, dy) > 0.05) this.runUntilMs = time + 115;
      // Suppress facing jitter from diagonal and tiny steering corrections.
      if (dx > 0.25) this.orientation = 1;
      else if (dx < -0.25) this.orientation = -1;
    } else if (!alive) {
      // Combat pause/death cannot keep a stale running pose alive.
      this.runUntilMs = time;
    }
    // Copy instead of retaining a mutable player object.
    this.previous = { x: position.x, y: position.y };
    this.lastTimeMs = time;
    this.locomoting = alive && time < this.runUntilMs;
    const frameTime = this.locomoting ? 110 : 380;
    return (this.locomoting ? 4 : 0) + (Math.floor(time / frameTime) % 4);
  }
}
