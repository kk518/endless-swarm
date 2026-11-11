import type { WeaponId } from './progression';

/** Layered original synthesized audio, unlocked only by the first user gesture. */
export class SoundFx {
  private context: AudioContext | null = null;
  private muted = false;
  private lastShot = 0;
  private lastWeaponSound: Record<WeaponId, number> = { rifle: 0, scatter: 0, arc: 0, flame: 0 };
  private noiseBuffer: AudioBuffer | null = null;

  unlock(): void {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch { /* Playback is optional; game must also work without audio. */ }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) this.unlock();
  }

  private tone(frequency: number, duration: number, gain: number, shape: OscillatorType): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const volume = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * 0.48), now + duration);
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(volume).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  /** Short filtered impact noise—one reused 150ms buffer, never external media. */
  private noise(gain: number, frequency: number): void {
    const ctx = this.context;
    if (this.muted || !ctx || ctx.state !== 'running') return;
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.15), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const volume = ctx.createGain();
    const now = ctx.currentTime;
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    source.connect(filter); filter.connect(volume); volume.connect(ctx.destination);
    source.start(now); source.stop(now + 0.15);
  }

  /** Four different signatures: rail crack, concussive blast, electrical snap, roaring jet. */
  weaponShot(weapon: WeaponId, tier: number): void {
    const now = performance.now();
    const minGap: Record<WeaponId, number> = { rifle: 68, scatter: 220, arc: 250, flame: 105 };
    if (now - this.lastWeaponSound[weapon] < minGap[weapon]) return;
    this.lastWeaponSound[weapon] = now;
    const extra = Math.min(3, Math.max(0, tier));
    switch (weapon) {
      case 'rifle':
        this.tone(195 + 30 * extra, 0.075, 0.033 + extra * 0.003, 'sawtooth');
        this.tone(65, 0.065, 0.012, 'triangle');
        break;
      case 'scatter':
        this.tone(88, 0.18, 0.075, 'sawtooth');
        this.tone(53, 0.21, 0.04, 'triangle');
        this.noise(0.047, 680);
        break;
      case 'arc':
        this.tone(820 + 80 * extra, 0.15, 0.034, 'square');
        this.tone(240, 0.10, 0.022, 'sine');
        this.noise(0.018, 2500);
        break;
      case 'flame':
        this.tone(143 + 12 * extra, 0.095, 0.025, 'sawtooth');
        this.noise(0.014, 520);
        break;
    }
  }

  shot(): void {
    const now = performance.now();
    if (now - this.lastShot < 90) return;
    this.lastShot = now;
    this.tone(195, 0.065, 0.028, 'sawtooth');
  }
  kill(): void { this.tone(410, 0.10, 0.018, 'triangle'); }
  hurt(): void { this.tone(110, 0.22, 0.085, 'sawtooth'); }
  deploy(): void { this.tone(590, 0.24, 0.035, 'sine'); }
}
