/** Tiny synthesized sound effects; starts only after an explicit user gesture. */
export class SoundFx {
  private context: AudioContext | null = null;
  private muted = false;
  private lastShot = 0;

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
