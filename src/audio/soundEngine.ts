// Synthétiseur audio 8-bit / 16-bit inspiré du DAC de la Gamebuino AKA (Web Audio API pure)

class GamebuinoSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'square',
    gainPeak = 0.14,
    delaySec = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(24, freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), now + durationSec);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  }

  private playNoise(durationSec: number, gainPeak = 0.18, bandpassFreq = 900, delaySec = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const sampleCount = Math.max(256, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(bandpassFreq, now);
    filter.Q.setValueAtTime(1.1, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + durationSec + 0.01);
  }

  public menuMove(): void {
    this.playTone(520, 680, 0.045, 'square', 0.08);
  }

  public menuConfirm(): void {
    this.playTone(440, 660, 0.07, 'square', 0.11, 0);
    this.playTone(660, 880, 0.11, 'square', 0.12, 0.065);
  }

  public jump(): void {
    this.playTone(170, 420, 0.11, 'triangle', 0.10);
  }

  public whiff(): void {
    this.playNoise(0.055, 0.07, 1600);
  }

  public lightHit(): void {
    this.playNoise(0.07, 0.18, 1200);
    this.playTone(260, 95, 0.08, 'square', 0.13);
  }

  public heavyHit(): void {
    this.playNoise(0.14, 0.25, 650);
    this.playTone(190, 52, 0.16, 'sawtooth', 0.18);
  }

  public blockHit(): void {
    this.playTone(880, 440, 0.07, 'triangle', 0.13);
    this.playNoise(0.05, 0.10, 2400);
  }

  public throwSlam(): void {
    this.playNoise(0.22, 0.28, 340);
    this.playTone(140, 36, 0.25, 'sawtooth', 0.22);
  }

  public specialMove(kind: 'KI' | 'TELEPORT' | 'HARPOON' | 'LIGHTNING' | 'HEAVY'): void {
    switch (kind) {
      case 'KI':
        this.playTone(320, 760, 0.16, 'sawtooth', 0.13);
        this.playNoise(0.12, 0.11, 1400, 0.02);
        break;
      case 'TELEPORT':
        this.playTone(920, 180, 0.14, 'sine', 0.15);
        this.playTone(220, 840, 0.12, 'triangle', 0.12, 0.09);
        break;
      case 'HARPOON':
        this.playNoise(0.09, 0.16, 2800);
        this.playTone(620, 290, 0.14, 'sawtooth', 0.14);
        break;
      case 'LIGHTNING':
        this.playNoise(0.18, 0.20, 3200);
        this.playTone(1100, 280, 0.16, 'square', 0.12);
        break;
      case 'HEAVY':
        this.playTone(150, 70, 0.20, 'sawtooth', 0.18);
        this.playNoise(0.16, 0.18, 500);
        break;
    }
  }

  public taunt(): void {
    this.playTone(240, 190, 0.09, 'sawtooth', 0.11, 0);
    this.playTone(220, 170, 0.09, 'sawtooth', 0.11, 0.11);
    this.playTone(200, 150, 0.13, 'sawtooth', 0.12, 0.22);
  }

  public roundBell(): void {
    this.playTone(587.33, 580, 0.35, 'triangle', 0.16, 0);
    this.playTone(880, 872, 0.35, 'square', 0.10, 0);
  }

  public finishHimSting(): void {
    // Accord dramatique grave façon Mortal Kombat
    this.playTone(110, 106, 0.55, 'sawtooth', 0.18, 0);
    this.playTone(130.81, 126, 0.55, 'sawtooth', 0.15, 0);
    this.playTone(164.81, 160, 0.55, 'square', 0.11, 0.05);
    this.playNoise(0.28, 0.14, 420, 0);
  }

  public finisherImpact(): void {
    this.playNoise(0.42, 0.30, 320, 0);
    this.playTone(220, 38, 0.45, 'sawtooth', 0.24, 0);
    this.playTone(440, 82, 0.40, 'square', 0.14, 0.08);
  }

  public koBlast(): void {
    this.playNoise(0.38, 0.28, 380, 0);
    this.playTone(240, 42, 0.42, 'sawtooth', 0.22, 0);
  }

  public victoryFanfare(): void {
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 1.01, 0.16, 'square', 0.11, idx * 0.11);
    });
  }
}

export const soundFX = new GamebuinoSoundEngine();
