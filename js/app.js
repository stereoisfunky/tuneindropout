// app.js — vanilla JS replacing all React components and state

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  masterVolume: 70,
  sounds: {
    ocean:    { active: false, volume: 50 },
    rain:     { active: false, volume: 50 },
    dripping: { active: false, volume: 50 },
    bird:     { active: false, volume: 50 },
    crickets: { active: false, volume: 50 },
    fire:     { active: false, volume: 50 },
    stream:   { active: false, volume: 50 },
    cat:      { active: false, volume: 50 },
    wind:     { active: false, volume: 50 },
  },
  noiseMode:   null,  // 'white' | 'pink' | 'brown' | null
  noiseVolume: 50,
  eq: [50, 50, 50, 50, 50, 50],
  binauralPreset: null,
  binauralVolume: 50,
  brainwaveFreq:  8,
  carrierFreq:    220,
};

const BINAURAL_PRESETS = {
  sleep:        { brainwave: 0.72,  carrier: 220 },
  dream:        { brainwave: 5.08,  carrier: 200 },
  creativity:   { brainwave: 7.85,  carrier: 250 },
  relaxation:   { brainwave: 9.76,  carrier: 220 },
  focus:        { brainwave: 50.94, carrier: 260 },
  productivity: { brainwave: 14.44, carrier: 280 },
};

const EQ_FREQ_LABELS = ['60', '250', '800', '2K', '5K', '11K'];

// EQ presets per noise type
const NOISE_EQ_PRESETS = {
  white: [12.5, 25, 37.5, 50, 62.5, 75],
  pink:  [50, 50, 50, 50, 50, 50],
  brown: [100, 87.5, 75, 50, 25, 12.5],
};

// ── Tabs ───────────────────────────────────────────────────────────────────

function initTabs() {
  const tabs    = document.querySelectorAll('.tab-btn');
  const panels  = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + target).classList.add('active');
    });
  });
}

// ── Knob math ──────────────────────────────────────────────────────────────

const KNOB = { cx: 50, cy: 50, r: 36, start: 135, range: 270 };

function polarToXY(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function knobArcPath(value) {
  const sweep = (Math.max(0, Math.min(100, value)) / 100) * KNOB.range;
  if (sweep < 0.5) return '';
  const s = polarToXY(KNOB.cx, KNOB.cy, KNOB.r, KNOB.start);
  const e = polarToXY(KNOB.cx, KNOB.cy, KNOB.r, KNOB.start + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${KNOB.r} ${KNOB.r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ── Master Volume Knob ──────────────────────────────────────────────────────

function initMasterKnob() {
  const knob    = document.getElementById('master-knob');
  const fillEl  = knob.querySelector('.knob-fill');
  const valueEl = document.getElementById('master-knob-value');

  let isDragging = false, startY = 0, startValue = state.masterVolume;

  function setVolume(v) {
    state.masterVolume = Math.max(0, Math.min(100, Math.round(v)));
    valueEl.textContent = state.masterVolume + '%';
    fillEl.setAttribute('d', knobArcPath(state.masterVolume));
    knob.setAttribute('aria-valuenow', state.masterVolume);
    window.audioEngine.setMasterVolume(state.masterVolume);
  }

  // Mouse
  knob.addEventListener('mousedown', e => {
    e.preventDefault();
    isDragging = true; startY = e.clientY; startValue = state.masterVolume;
    const mm = ev => { if (isDragging) setVolume(startValue + (startY - ev.clientY) * (100 / 150)); };
    const mu = () => { isDragging = false; window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });

  // Touch
  knob.addEventListener('touchstart', e => {
    e.preventDefault();
    isDragging = true; startY = e.touches[0].clientY; startValue = state.masterVolume;
  }, { passive: false });
  knob.addEventListener('touchmove', e => {
    e.preventDefault();
    if (isDragging) setVolume(startValue + (startY - e.touches[0].clientY) * (100 / 150));
  }, { passive: false });
  knob.addEventListener('touchend', () => { isDragging = false; });

  // Keyboard (+/- arrow support)
  knob.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp'   || e.key === 'ArrowRight') setVolume(state.masterVolume + 1);
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft')  setVolume(state.masterVolume - 1);
  });

  setVolume(state.masterVolume); // initial render
}

function updateSliderTrack(input, value) {
  const pct = ((value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--pct', pct + '%');
}

// ── Sound Tiles ────────────────────────────────────────────────────────────

function initSoundTiles() {
  document.querySelectorAll('.sound-tile').forEach(tile => {
    const id = tile.dataset.sound;
    makeTileInteractive(tile, {
      getActive:  ()  => state.sounds[id].active,
      getVolume:  ()  => state.sounds[id].volume,
      onToggle:   ()  => toggleNaturalSound(id),
      onVolume:   (v) => setNaturalVolume(id, v),
    });
  });

  // Noise tiles
  document.querySelectorAll('.noise-tile').forEach(tile => {
    const type = tile.dataset.noise;
    makeTileInteractive(tile, {
      getActive:  () => state.noiseMode === type,
      getVolume:  () => state.noiseVolume,
      onToggle:   () => toggleNoise(type),
      onVolume:   (v) => setNoiseVolume(v),
    });
  });

  // Binaural preset tiles
  document.querySelectorAll('.preset-tile').forEach(tile => {
    const preset = tile.dataset.preset;
    makeTileInteractive(tile, {
      getActive:  () => state.binauralPreset === preset,
      getVolume:  () => state.binauralVolume,
      onToggle:   () => selectBinauralPreset(preset),
      onVolume:   (v) => setBinauralVolume(v),
    });
  });
}

function makeTileInteractive(tile, { getActive, getVolume, onToggle, onVolume }) {
  let isDragging    = false;
  let dragStartY    = 0;
  let dragStartVol  = 0;
  let hasMoved      = false;

  function onStart(clientY) {
    hasMoved = false;
    if (getActive()) {
      isDragging   = true;
      dragStartY   = clientY;
      dragStartVol = getVolume();
    }
  }

  function onMove(clientY) {
    if (!isDragging) return;
    const delta = dragStartY - clientY;
    if (Math.abs(delta) > 5) hasMoved = true;
    const newVol = Math.max(0, Math.min(100, Math.round(dragStartVol + delta / 1.5)));
    onVolume(newVol);
    renderTile(tile, getActive, getVolume);
  }

  // Mouse
  tile.addEventListener('mousedown', e => {
    e.preventDefault();
    if (getActive()) {
      onStart(e.clientY);
      const mm = ev => { onMove(ev.clientY); };
      const mu = () => {
        if (isDragging && !hasMoved) onToggle();
        isDragging = false;
        hasMoved   = false;
        renderTile(tile, getActive, getVolume);
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup',  mu);
      };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup',  mu);
    } else {
      // Inactive tile: toggle on mouseup (prevents accidental drags)
      const mu = () => {
        onToggle();
        renderTile(tile, getActive, getVolume);
        window.removeEventListener('mouseup', mu);
      };
      window.addEventListener('mouseup', mu);
    }
  });

  // Touch
  tile.addEventListener('touchstart', e => {
    e.stopPropagation();
    const touch = e.touches[0];
    if (getActive()) {
      onStart(touch.clientY);
    }
  }, { passive: true });

  tile.addEventListener('touchmove', e => {
    e.preventDefault();
    onMove(e.touches[0].clientY);
  }, { passive: false });

  tile.addEventListener('touchend', e => {
    e.preventDefault();
    if (!getActive()) {
      onToggle();
    } else if (isDragging && !hasMoved) {
      onToggle();
    }
    isDragging = false;
    hasMoved   = false;
    renderTile(tile, getActive, getVolume);
  });

  tile.addEventListener('touchcancel', () => { isDragging = false; hasMoved = false; });
  tile.addEventListener('contextmenu', e => e.preventDefault());
}

function renderTile(tile, getActive, getVolume) {
  const active   = getActive();
  const volume   = getVolume();
  const fill     = tile.querySelector('.tile-fill');
  const volBadge = tile.querySelector('.tile-vol-badge');

  tile.classList.toggle('active', active);
  if (fill) {
    fill.style.height = active ? volume + '%' : '0%';
  }
  if (volBadge) {
    volBadge.textContent = volume + '%';
  }
}

function renderAllTiles() {
  document.querySelectorAll('.sound-tile').forEach(tile => {
    const id = tile.dataset.sound;
    renderTile(tile, () => state.sounds[id].active, () => state.sounds[id].volume);
  });
  document.querySelectorAll('.noise-tile').forEach(tile => {
    const type = tile.dataset.noise;
    renderTile(tile, () => state.noiseMode === type, () => state.noiseVolume);
  });
  document.querySelectorAll('.preset-tile').forEach(tile => {
    const preset = tile.dataset.preset;
    renderTile(tile, () => state.binauralPreset === preset, () => state.binauralVolume);
  });
}

// ── Natural Sound Logic ────────────────────────────────────────────────────

function toggleNaturalSound(id) {
  const s      = state.sounds[id];
  s.active = !s.active;
  if (s.active && s.volume === 0) s.volume = 50; // only reset if muted
  if (s.active) {
    window.audioEngine.startNaturalSound(id, s.volume);
  } else {
    window.audioEngine.stopNaturalSound(id);
  }
}

function setNaturalVolume(id, volume) {
  state.sounds[id].volume = volume;
  if (state.sounds[id].active) {
    window.audioEngine.updateNaturalSoundVolume(id, volume);
  }
}

// ── Noise Logic ────────────────────────────────────────────────────────────

function toggleNoise(type) {
  const wasActive   = state.noiseMode === type;
  state.noiseMode   = wasActive ? null : type;

  if (state.noiseMode) {
    state.noiseVolume = 50;
    state.eq = [...NOISE_EQ_PRESETS[state.noiseMode]];
    window.audioEngine.startNoise(state.noiseMode, state.noiseVolume, state.eq);
    renderEQ();
  } else {
    window.audioEngine.stopNoise();
  }
  renderAllTiles();
}

function setNoiseVolume(volume) {
  state.noiseVolume = volume;
  window.audioEngine.updateNoiseVolume(volume);
}

// ── EQ ─────────────────────────────────────────────────────────────────────

function initEQ() {
  document.querySelectorAll('.eq-slider').forEach((slider, i) => {
    let isDragging = false;

    slider.addEventListener('mousedown', () => {
      isDragging = true;
      const mm = e => { if (isDragging) setEQFromDrag(slider, i, e.clientY); };
      const mu = () => { isDragging = false; window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup',  mu);
    });

    slider.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });
    slider.addEventListener('touchmove',  e => {
      e.preventDefault();
      if (isDragging) setEQFromDrag(slider, i, e.touches[0].clientY);
    }, { passive: false });
    slider.addEventListener('touchend', () => { isDragging = false; });
  });
}

function setEQFromDrag(sliderEl, index, clientY) {
  const rect = sliderEl.getBoundingClientRect();
  const rel  = clientY - rect.top;
  const pct  = 100 - Math.max(0, Math.min(100, (rel / rect.height) * 100));
  state.eq[index] = Math.round(pct);
  renderEQ();
  if (state.noiseMode) window.audioEngine.updateEQ(state.eq);
}

function renderEQ() {
  document.querySelectorAll('.eq-slider').forEach((slider, i) => {
    const val   = state.eq[i];
    const fill  = slider.querySelector('.eq-fill');
    const thumb = slider.querySelector('.eq-thumb');
    if (fill)  fill.style.height  = val + '%';
    if (thumb) thumb.style.bottom = `calc(${val}% - 12px)`;
  });
}

// ── Binaural ───────────────────────────────────────────────────────────────

function selectBinauralPreset(preset) {
  const wasActive = state.binauralPreset === preset;

  if (wasActive) {
    state.binauralPreset = null;
    window.audioEngine.stopBinauralBeat();
  } else {
    state.binauralPreset = preset;
    state.binauralVolume = 50;
    const p = BINAURAL_PRESETS[preset];
    state.brainwaveFreq  = p.brainwave;
    state.carrierFreq    = p.carrier;
    window.audioEngine.startBinauralBeat(p.brainwave, p.carrier, 50);
    renderBinauralSliders();
  }
  renderAllTiles();
}

function setBinauralVolume(volume) {
  state.binauralVolume = volume;
  if (state.binauralPreset) window.audioEngine.updateBinauralVolume(volume);
}

function initBinauralSliders() {
  const bwInput  = document.getElementById('brainwave-slider');
  const bwLabel  = document.getElementById('brainwave-value');
  const cfInput  = document.getElementById('carrier-slider');
  const cfLabel  = document.getElementById('carrier-value');

  bwInput.addEventListener('input', () => {
    state.brainwaveFreq = Number(bwInput.value);
    bwLabel.textContent = parseFloat(bwInput.value).toFixed(2) + ' Hz';
    updateSliderTrack(bwInput, state.brainwaveFreq);
    if (state.binauralPreset) window.audioEngine.updateBinauralFrequencies(state.brainwaveFreq, state.carrierFreq);
  });

  cfInput.addEventListener('input', () => {
    state.carrierFreq = Number(cfInput.value);
    cfLabel.textContent = state.carrierFreq + ' Hz';
    updateSliderTrack(cfInput, state.carrierFreq);
    if (state.binauralPreset) window.audioEngine.updateBinauralFrequencies(state.brainwaveFreq, state.carrierFreq);
  });

  renderBinauralSliders();
}

function renderBinauralSliders() {
  const bwInput = document.getElementById('brainwave-slider');
  const bwLabel = document.getElementById('brainwave-value');
  const cfInput = document.getElementById('carrier-slider');
  const cfLabel = document.getElementById('carrier-value');

  bwInput.value       = state.brainwaveFreq;
  bwLabel.textContent = parseFloat(state.brainwaveFreq).toFixed(2) + ' Hz';
  updateSliderTrack(bwInput, state.brainwaveFreq);

  cfInput.value       = state.carrierFreq;
  cfLabel.textContent = state.carrierFreq + ' Hz';
  updateSliderTrack(cfInput, state.carrierFreq);
}

// ── Boot ───────────────────────────────────────────────────────────────────

async function init() {
  await window.audioEngine.initialize();
  window.audioEngine.setMasterVolume(state.masterVolume);

  initTabs();
  initMasterKnob();
  initSoundTiles();
  initEQ();
  initBinauralSliders();
  renderEQ();
  renderAllTiles();

  // Arise animation trigger
  document.querySelectorAll('.arise').forEach((el, i) => {
    el.style.animationDelay = (0.1 + i * 0.08) + 's';
    el.classList.add('arise-active');
  });
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', () => window.audioEngine.cleanup());
