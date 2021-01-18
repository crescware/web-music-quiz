interface Window {
  webkitAudioContext: typeof AudioContext;
}

const oscillatorNotFoundError = 'Oscillator not found';

export class Synth {
  playCount = 0;
  ctx: AudioContext | null = null;
  gainEnvelope: GainNode | null = null;
  oscGroup: [hash: string, osc: OscillatorNode][] = [];

  constructor() {
    this.init();
  }

  async play(hz: number, durationMs: number): Promise<void> {
    const n = 16;
    const hash = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))
    ).substring(0, n);
    await this.playImpl(hz, durationMs, hash);
  }

  async playImpl(hz: number, durationMs: number, hash: string): Promise<void> {
    console.log('play', hash);
    if (0 < this.playCount) {
      this.stopOthers(hash);
      await this.sleep(1);
    }

    const [ctx, gainEnvelope] = this.getInstances();
    let osc: OscillatorNode;
    try {
      osc = this.getOscillator(hash);
    } catch (e) {
      if (!e.message.includes(oscillatorNotFoundError)) {
        throw e;
      }
      this.createNewOscillator(hash);
      osc = this.getOscillator(hash);
    }
    osc.frequency.value = hz;

    const t1 = ctx.currentTime;
    gainEnvelope.gain.cancelScheduledValues(t1);
    gainEnvelope.gain.setValueAtTime(0, t1);
    gainEnvelope.gain.linearRampToValueAtTime(1, t1 + 0.001);

    this.playCount += 1;
    osc.start();

    const releaseMs = Math.max(1, Math.min(200, durationMs));
    await this.sleep(durationMs - releaseMs);

    const t2 = ctx.currentTime;
    gainEnvelope.gain.setValueAtTime(gainEnvelope.gain.value, t2);
    gainEnvelope.gain.linearRampToValueAtTime(0, t2 + releaseMs / 1000);

    await this.sleep(releaseMs);

    this.playCount -= 1;
    this.destroyOscillator(hash);
  }

  private init() {
    this.ctx = (() => {
      if ('webkitAudioContext' in window) {
        return new ((window as unknown) as Window).webkitAudioContext();
      }
      return new AudioContext();
    })();
    this.gainEnvelope = this.ctx.createGain();
    this.gainEnvelope.connect(this.ctx.destination);
  }

  private getInstances(): [AudioContext, GainNode] {
    if (this.ctx === null || this.gainEnvelope === null) {
      throw new Error('Invalid instantiation');
    }
    return [this.ctx, this.gainEnvelope];
  }

  private getOscillator(hash: string): OscillatorNode {
    const found = this.oscGroup.find(([hash_]) => hash_ === hash);
    if (!found) {
      throw new Error(oscillatorNotFoundError);
    }
    return found[1];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createNewOscillator(hash: string): void {
    if (this.ctx === null || this.gainEnvelope === null) {
      throw new Error('Invalid instantiation');
    }
    const i = this.oscGroup.findIndex(([hash_]) => hash_ === hash);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.connect(this.gainEnvelope);
    if (i < 0) {
      this.oscGroup = this.oscGroup.concat([[hash, osc]]);
      return;
    }
    this.oscGroup[i][1] = osc;
  }

  private stopOthers(hash: string): void {
    this.oscGroup
      .filter(([hash_]) => hash_ !== hash)
      .forEach(([hash_]) => {
        this.destroyOscillator(hash_);
      });
  }

  private destroyOscillator(hash: string): void {
    let osc: OscillatorNode;
    try {
      osc = this.getOscillator(hash);
    } catch (e) {
      if (!e.message.includes(oscillatorNotFoundError)) {
        throw e;
      }
      return;
    }
    osc.stop();
    osc.disconnect();
    this.oscGroup = this.oscGroup.filter(([hash_]) => hash_ !== hash);
  }
}
