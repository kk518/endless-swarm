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

  reset(): void {
    this.previous = null;
    this.lastTimeMs = -1;
    this.runUntilMs = 0;
  }

  frame(position: MechMotionPoint, elapsedMs: number, alive = true): number {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)
      || !Number.isFinite(elapsedMs)) {
      this.reset();
      return 0;
    }
    const time = Math.max(0, elapsedMs);
    if (time < this.lastTimeMs) this.reset();
    if (alive && this.previous
      && Math.hypot(position.x - this.previous.x,
        position.y - this.previous.y) > 0.05) {
      this.runUntilMs = time + 115;
    }
    // Copy instead of retaining a mutable player object.
    this.previous = { x: position.x, y: position.y };
    this.lastTimeMs = time;
    const running = alive && time < this.runUntilMs;
    const frameTime = running ? 110 : 380;
    return (running ? 4 : 0) + (Math.floor(time / frameTime) % 4);
  }
}
