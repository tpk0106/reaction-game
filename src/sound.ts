import type { Rating } from './game-state';

/**
 * Lightweight sound layer using the Web Audio API. Tones are synthesized
 * with oscillators rather than loaded audio files, so there are no binary
 * assets to ship or license — consistent with the project's "procedural,
 * dependency-light" approach already used for the Three.js shape.
 *
 * This module knows nothing about game state or the DOM; main.ts calls its
 * methods in response to state transitions, the same way ui.ts and scene.ts
 * are driven.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;

  /**
   * AudioContext must be created/resumed after a user gesture in most
   * browsers. Since every call here originates from a click/tap handler
   * in main.ts, lazily creating it on first use satisfies that requirement
   * without any extra "enable sound" step for the user.
   */
  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private tone(
    frequency: number,
    durationMs: number,
    type: OscillatorType,
    startDelaySec = 0,
    peakGain = 0.2,
  ): void {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = frequency;

    const startAt = ctx.currentTime + startDelaySec;
    const stopAt = startAt + durationMs / 1000;

    // Quick attack, exponential decay — avoids clicks and keeps each tone short.
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(stopAt + 0.02);
  }

  /** Harsh double buzz for a false start — clicked before the stimulus. */
  playFalseStart(): void {
    this.tone(220, 140, 'square', 0, 0.22);
    this.tone(180, 160, 'square', 0.16, 0.22);
  }

  /** Result chime, shaped by the reaction-time rating so better scores
   *  sound brighter and worse scores sound duller/lower. */
  playResult(rating: Rating): void {
    switch (rating) {
      case 'Excellent':
        this.tone(660, 90, 'sine', 0, 0.2);
        this.tone(880, 160, 'sine', 0.08, 0.2);
        break;
      case 'Very Good':
        this.tone(587, 100, 'sine', 0, 0.2);
        this.tone(740, 140, 'sine', 0.09, 0.18);
        break;
      case 'Good':
        this.tone(523, 160, 'triangle', 0, 0.18);
        break;
      case 'Below Average':
        this.tone(392, 240, 'sawtooth', 0, 0.16);
        break;
    }
  }
}

export const soundEngine = new SoundEngine();
