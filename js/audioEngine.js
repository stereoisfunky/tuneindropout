// Audio Engine — plain JS
// Exposed as window.audioEngine singleton

const AUDIO_FILES = {
  fire:     'assets/sounds/fire.mp3',
  dripping: 'assets/sounds/dripping.mp3',
  rain:     'assets/sounds/rain.mp3',
  ocean:    'assets/sounds/ocean.mp3',
  bird:     'assets/sounds/birds.mp3',
  crickets: 'assets/sounds/crickets.mp3',
  stream:   'assets/sounds/stream.mp3',
  cat:      'assets/sounds/cat.mp3',
  wind:     'assets/sounds/wind.mp3',
  rain2:    'assets/sounds/rain2.mp3',
  sea:      'assets/sounds/sea.mp3',
  med1:     'assets/sounds/med1.mp3',
  med2:     'assets/sounds/med2.mp3',
  med3:     'assets/sounds/med3.mp3',
  med4:     'assets/sounds/med4.mp3',
};

// Tracks long enough that decoding them whole would cost hundreds of MB
// (a 13-minute stereo track is ~275 MB as raw samples). These stream from an
// <audio> element instead, at the cost of a small gap at the loop point.
const STREAMED = new Set(['med1', 'med2', 'med3', 'med4']);

const FADE_TIME          = 0.05;
const BINAURAL_FADE_TIME = 0.5;
const LOOP_XFADE         = 1.0;   // crossfade duration at loop boundaries (seconds)

class AudioEngine {
  constructor() {
    this.audioContext  = null;
    this.masterGain    = null;
    this.isUnlocked    = false;
    this._masterVolume = 70;   // tracked for native-audio volume calc

    this.noiseSource   = null;
    this.noiseGain     = null;
    this.eqFilters     = [];

    this.naturalSounds    = new Map();
    this.audioBufferCache = new Map();

    this.binauralLeft  = null;
    this.binauralRight = null;
    this.binauralGain  = null;
  }

  async initialize() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({ latencyHint: 'interactive' });
    this.masterGain   = this.audioContext.createGain();

    // Limiter: sounds are normalised up to +24 dB and stack freely, so catch
    // the peaks just below 0 dBFS instead of letting the output clip.
    this.limiter = this.audioContext.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value      = 0;
    this.limiter.ratio.value     = 20;
    this.limiter.attack.value    = 0.003;
    this.limiter.release.value   = 0.25;

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.audioContext.destination);

    // EQ filter chain (used by noise only)
    const frequencies = [60, 250, 800, 2000, 5000, 11000];
    frequencies.forEach(freq => {
      const f = this.audioContext.createBiquadFilter();
      f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1; f.gain.value = 0;
      this.eqFilters.push(f);
    });
    for (let i = 0; i < this.eqFilters.length - 1; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1]);
    }
    this.eqFilters[this.eqFilters.length - 1].connect(this.masterGain);

    this._setupTouchUnlock();
  }

  _setupTouchUnlock() {
    const unlock = async () => {
      if (this.isUnlocked) return;
      try {
        if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
        // Inaudible oscillator pulse to fully unlock Web Audio on iOS/Safari
        if (this.audioContext) {
          const osc  = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();
          gain.gain.value = 0;
          osc.connect(gain);
          gain.connect(this.audioContext.destination);
          osc.start(0);
          osc.stop(this.audioContext.currentTime + 0.001);
        }
        this.isUnlocked = true;
        document.removeEventListener('mousedown',  unlock, true);
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('touchend',   unlock, true);
      } catch (e) {
        console.warn('[audioEngine] unlock failed:', e);
      }
    };
    document.addEventListener('mousedown',  unlock, { capture: true, passive: true });
    document.addEventListener('touchstart', unlock, { capture: true, passive: true });
    document.addEventListener('touchend',   unlock, { capture: true, passive: true });
  }

  async ensureReady() {
    if (!this.audioContext) await this.initialize();
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
    return this.audioContext?.state === 'running';
  }

  _volumeToGain(volume, maxGain = 1) {
    return Math.pow(volume / 100, 2) * maxGain;
  }

  // Linear gain for native HTMLAudioElement (0–1), combining per-sound + master
  _nativeGain(perSoundVolume) {
    return this._volumeToGain(perSoundVolume) * this._volumeToGain(this._masterVolume);
  }

  setMasterVolume(volume) {
    this._masterVolume = volume;
    if (this.masterGain) {
      this.masterGain.gain.value = this._volumeToGain(volume);
    }
    // Keep native audio elements in sync
    this.naturalSounds.forEach(sound => {
      if (sound.native) sound.audio.volume = this._nativeGain(sound.vol);
    });
  }

  // ── Noise ──────────────────────────────────────────────────────────

  _createNoiseBuffer(type) {
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data   = buffer.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < bufferSize; i++) {
        const w=Math.random()*2-1;
        b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
        b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
        b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
        data[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
      }
    } else if (type === 'brown') {
      let lastOut=0;
      for (let i = 0; i < bufferSize; i++) {
        const w=Math.random()*2-1;
        data[i]=(lastOut+0.02*w)/1.02; lastOut=data[i]; data[i]*=3.5;
      }
    }
    return buffer;
  }

  async startNoise(type, volume, eqValues) {
    this.stopNoise();
    await this.ensureReady();
    if (!this.audioContext) return;
    const buffer     = this._createNoiseBuffer(type);
    this.noiseSource = this.audioContext.createBufferSource();
    this.noiseSource.buffer = buffer; this.noiseSource.loop = true;
    this.noiseGain = this.audioContext.createGain();
    this.noiseGain.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.noiseGain.gain.linearRampToValueAtTime(this._volumeToGain(volume), this.audioContext.currentTime + FADE_TIME);
    eqValues.forEach((v, i) => { this.eqFilters[i].gain.value = (v-50)*0.24; });
    this.noiseSource.connect(this.noiseGain);
    this.noiseGain.connect(this.eqFilters[0]);
    this.noiseSource.start();
  }

  stopNoise() {
    if (this.noiseSource && this.noiseGain && this.audioContext) {
      const t = this.audioContext.currentTime;
      this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, t);
      this.noiseGain.gain.linearRampToValueAtTime(0, t + FADE_TIME);
      const src=this.noiseSource, g=this.noiseGain;
      setTimeout(() => { src.stop(); src.disconnect(); g.disconnect(); }, FADE_TIME*1000+10);
      this.noiseSource=null; this.noiseGain=null;
    }
  }

  updateNoiseVolume(volume) {
    if (this.noiseGain && this.audioContext) {
      const t = this.audioContext.currentTime;
      this.noiseGain.gain.setValueAtTime(this.noiseGain.gain.value, t);
      this.noiseGain.gain.linearRampToValueAtTime(this._volumeToGain(volume), t + FADE_TIME);
    }
  }

  updateEQ(eqValues) {
    eqValues.forEach((v, i) => { this.eqFilters[i].gain.value = (v-50)*0.24; });
  }

  // ── Natural sounds ─────────────────────────────────────────────────

  // Load, decode and prepare a loop once per URL. The promise is cached so
  // concurrent starts of the same sound share a single download.
  _loadLoop(url) {
    if (!this.audioBufferCache.has(url)) {
      const promise = this._loadAudioFile(url).then(buf => this._prepareLoop(buf));
      promise.catch(() => this.audioBufferCache.delete(url));
      this.audioBufferCache.set(url, promise);
    }
    return this.audioBufferCache.get(url);
  }

  async _loadAudioFile(url) {
    const arrayBuffer = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.timeout = 30000;
      xhr.onload    = () => (xhr.status === 0 || xhr.status === 200) ? resolve(xhr.response) : reject(new Error(`HTTP ${xhr.status}`));
      xhr.onerror   = () => reject(new Error('XHR network error'));
      xhr.ontimeout = () => reject(new Error('XHR timeout'));
      xhr.send();
    });
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  // Bake the loop crossfade into the buffer so it can loop natively, with no
  // JS timers (which browsers throttle in background tabs). The tail is
  // equal-power mixed into the head, and playback loops before the tail:
  // the last looped sample flows straight into head[0] == tail[0].
  _prepareLoop(buffer) {
    const normGain = this._lufsNormGain(buffer);
    const xfade    = Math.floor(Math.min(LOOP_XFADE, buffer.duration * 0.25) * buffer.sampleRate);
    const loopLen  = buffer.length - xfade;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < xfade; i++) {
        const t = (i / xfade) * Math.PI / 2;
        d[i] = d[i] * Math.sin(t) + d[loopLen + i] * Math.cos(t);
      }
    }
    return { buffer, normGain, loopEnd: loopLen / buffer.sampleRate };
  }

  _measureRMS(buf) {
    let sum=0, count=0;
    for (let ch=0; ch<buf.numberOfChannels; ch++) {
      const d=buf.getChannelData(ch);
      for (let i=0; i<d.length; i++) { sum+=d[i]*d[i]; count++; }
    }
    return Math.sqrt(sum/count);
  }

  _lufsNormGain(buf, target=-13) {
    const rms = this._measureRMS(buf);
    if (rms < 1e-8) return 1;
    return Math.pow(10, Math.max(-24, Math.min(24, target - 20*Math.log10(rms))) / 20);
  }

  async startNaturalSound(soundId, volume) {
    if (this.naturalSounds.has(soundId)) return;
    const url = AUDIO_FILES[soundId];
    if (!url) return;

    // Claim the slot before any await. If the sound is stopped (or stopped and
    // restarted) while loading, this entry is replaced and the load bails out.
    const pending = { pending: true, vol: volume };
    this.naturalSounds.set(soundId, pending);
    const stillWanted = () => this.naturalSounds.get(soundId) === pending;

    await this.ensureReady();
    if (!this.audioContext) { if (stillWanted()) this.naturalSounds.delete(soundId); return; }
    if (!stillWanted()) return;

    // ── Path S: long tracks stream, so they are never decoded whole ──
    if (STREAMED.has(soundId) && window.location.protocol !== 'file:') {
      this._startStream(soundId, url, pending.vol);
      return;
    }

    // ── Path A: XHR → AudioBuffer (http/https, gapless crossfaded loop) ──
    if (window.location.protocol !== 'file:') {
      try {
        const loop = await this._loadLoop(url);
        if (!stillWanted()) return;
        this._startLoop(soundId, loop, pending.vol);
        return;
      } catch (e) {
        console.error(`[audioEngine] XHR failed for ${soundId}:`, e);
        if (!stillWanted()) return;
      }
    }

    // ── Path B: HTMLAudioElement (file:// protocol, no CORS issues) ──
    const audio  = new Audio(url);
    audio.loop   = true;
    audio.volume = this._nativeGain(pending.vol);
    audio.play().catch(e => console.error(`[audioEngine] play() failed for ${soundId}:`, e));
    this.naturalSounds.set(soundId, { audio, vol: pending.vol, native: true });
  }

  // Streamed loop: the element feeds the same master chain as everything else,
  // so master volume and the limiter apply uniformly. No RMS normalisation is
  // possible here (the samples are never all in memory), so gain is 1:1.
  _startStream(soundId, url, volume) {
    const ctx   = this.audioContext;
    const audio = new Audio(url);
    audio.loop    = true;
    audio.preload = 'auto';

    const source = ctx.createMediaElementSource(audio);
    const gain   = ctx.createGain();
    const t      = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this._volumeToGain(volume), t + LOOP_XFADE);
    source.connect(gain);
    gain.connect(this.masterGain);
    audio.play().catch(e => console.error(`[audioEngine] stream play() failed for ${soundId}:`, e));

    const rampTo = (value) => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(value, now + FADE_TIME);
    };

    this.naturalSounds.set(soundId, {
      native: false,
      streamed: true,
      vol: volume,
      _stop: () => {
        rampTo(0);
        setTimeout(() => {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          source.disconnect();
          gain.disconnect();
        }, FADE_TIME * 1000 + 50);
      },
      _updateVolume: (newVol) => rampTo(this._volumeToGain(newVol)),
    });
  }

  _startLoop(soundId, { buffer, normGain, loopEnd }, volume) {
    const ctx  = this.audioContext;
    const t    = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this._volumeToGain(volume) * normGain, t + LOOP_XFADE);

    const src = ctx.createBufferSource();
    src.buffer    = buffer;
    src.loop      = true;
    src.loopStart = 0;
    src.loopEnd   = loopEnd;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
    src.start(t);

    const rampTo = (value, time) => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(value, now + time);
      return now + time;
    };

    this.naturalSounds.set(soundId, {
      native: false,
      vol: volume,
      _stop:         ()       => src.stop(rampTo(0, FADE_TIME)),
      _updateVolume: (newVol) => rampTo(this._volumeToGain(newVol) * normGain, FADE_TIME),
    });
  }

  stopNaturalSound(soundId) {
    const sound = this.naturalSounds.get(soundId);
    if (!sound) return;
    if (sound.native) {
      sound.audio.pause();
      sound.audio.src = '';
    } else if (sound._stop) {
      sound._stop();
    }
    this.naturalSounds.delete(soundId);
  }

  updateNaturalSoundVolume(soundId, volume) {
    const sound = this.naturalSounds.get(soundId);
    if (!sound) return;
    sound.vol = volume;
    if (sound.native) {
      sound.audio.volume = this._nativeGain(volume);
    } else if (sound._updateVolume) {
      sound._updateVolume(volume);
    }
  }

  // ── Binaural beats ─────────────────────────────────────────────────

  async startBinauralBeat(brainwaveFreq, carrierFreq, volume = 50) {
    this.stopBinauralBeat();
    await this.ensureReady();
    if (!this.audioContext) return;
    const lp = this.audioContext.createStereoPanner(); lp.pan.value = -1;
    const rp = this.audioContext.createStereoPanner(); rp.pan.value =  1;
    this.binauralLeft  = this.audioContext.createOscillator();
    this.binauralLeft.frequency.value  = carrierFreq;           this.binauralLeft.type  = 'sine';
    this.binauralRight = this.audioContext.createOscillator();
    this.binauralRight.frequency.value = carrierFreq + brainwaveFreq; this.binauralRight.type = 'sine';
    this.binauralGain  = this.audioContext.createGain();
    this.binauralGain.gain.setValueAtTime(0, this.audioContext.currentTime);
    this.binauralGain.gain.linearRampToValueAtTime(
      this._volumeToGain(volume, 0.5), this.audioContext.currentTime + BINAURAL_FADE_TIME
    );
    this.binauralLeft.connect(lp);  this.binauralRight.connect(rp);
    lp.connect(this.binauralGain);  rp.connect(this.binauralGain);
    this.binauralGain.connect(this.masterGain);
    this.binauralLeft.start(); this.binauralRight.start();
  }

  stopBinauralBeat() {
    if (this.binauralLeft && this.binauralRight && this.binauralGain && this.audioContext) {
      const t = this.audioContext.currentTime;
      this.binauralGain.gain.setValueAtTime(this.binauralGain.gain.value, t);
      this.binauralGain.gain.linearRampToValueAtTime(0, t + BINAURAL_FADE_TIME);
      const l=this.binauralLeft, r=this.binauralRight, g=this.binauralGain;
      setTimeout(() => { l.stop(); l.disconnect(); r.stop(); r.disconnect(); g.disconnect(); }, BINAURAL_FADE_TIME*1000+10);
      this.binauralLeft=null; this.binauralRight=null; this.binauralGain=null;
    }
  }

  updateBinauralFrequencies(brainwaveFreq, carrierFreq) {
    if (this.binauralLeft && this.binauralRight) {
      this.binauralLeft.frequency.value  = carrierFreq;
      this.binauralRight.frequency.value = carrierFreq + brainwaveFreq;
    }
  }

  updateBinauralVolume(volume) {
    if (this.binauralGain && this.audioContext) {
      const t = this.audioContext.currentTime;
      this.binauralGain.gain.setValueAtTime(this.binauralGain.gain.value, t);
      this.binauralGain.gain.linearRampToValueAtTime(this._volumeToGain(volume, 0.5), t + FADE_TIME);
    }
  }

  cleanup() {
    this.stopNoise();
    this.stopBinauralBeat();
    this.naturalSounds.forEach((_, id) => this.stopNaturalSound(id));
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.isUnlocked = false;
  }
}

window.audioEngine = new AudioEngine();
