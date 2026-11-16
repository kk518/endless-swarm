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

/** Attack event comes from the simulation; animation never spawns shots. */
export interface MechShotSample {
  readonly source: string;
  readonly angle: number;
  readonly remainingMs: number;
}
export interface MechRecoilPose {
  readonly x: number;
  readonly y: number;
  readonly tiltDeg: number;
  readonly intensity: number;
}
const NO_RECOIL: MechRecoilPose = {x:0,y:0,tiltDeg:0,intensity:0};

/**
 * Sample a short-lived (95ms) mech-body reaction from real shot flashes.
 * World axes are +Y up; only the character art uses these offsets.
 * Physical colliders, weapon anchors and projectile positions stay fixed.
 */
export function sampleMechRecoil(shots:readonly MechShotSample[], active=true):MechRecoilPose{
  if(!active||shots.length===0)return NO_RECOIL;
  let x=0,y=0,total=0;
  // Bounded iteration and displacement even during a high-rate evolved build.
  for(let i=Math.max(0,shots.length-32);i<shots.length;i++){
    const shot=shots[i];
    if(!Number.isFinite(shot.angle)||!Number.isFinite(shot.remainingMs))continue;
    if(shot.remainingMs<=0||shot.remainingMs>95)continue;
    const phase=shot.remainingMs/95;
    const pulse=Math.sin(Math.PI*phase);
    const weight=shot.source==='scatter'?3.3
      :shot.source==='kane-rail'?3.8
      :shot.source==='flame'?1.6
      :shot.source==='arc'?1.4:2.5;
    const force=weight*pulse;
    x-=Math.cos(shot.angle)*force;
    y-=Math.sin(shot.angle)*force;
    total+=force;
  }
  // Return canonical positive-zero transforms for expired or invalid events.
  if(total<=0)return NO_RECOIL;
  const magnitude=Math.hypot(x,y);
  if(magnitude>4.5){const scale=4.5/magnitude;x*=scale;y*=scale;}
  return {
    x,y,
    tiltDeg:Math.max(-3,Math.min(3,-x*.65)),
    intensity:Math.min(1,total/6),
  };
}
