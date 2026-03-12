# Tune in Drop out

A zero-dependency ambient sound mixer. Plain HTML, CSS, and JavaScript — no build step, no framework.

Designed to match [stefanotrento.com](https://stefanotrento.com) and hosted as a Ghost page at `/soundscapes`.

---

## Structure

```
tuneindropout/
│
├── index.html              # Single page — all markup and inline SVG icons
│
├── css/
│   └── style.css           # All styles. Tokens at the top (:root), then layout,
│                           # knob, tabs, tiles, EQ, binaural, responsive.
│
├── js/
│   ├── audioEngine.js      # Web Audio engine (window.audioEngine singleton).
│   │                       # Handles MP3 loading, noise generation, binaural beats,
│   │                       # EQ filters, -13 LUFS normalisation, iOS unlock.
│   │                       # Two loading paths: XHR → AudioBuffer (http/https)
│   │                       # and HTMLAudioElement fallback (file://).
│   │
│   └── app.js              # UI logic. State object, tab switching, tile drag
│                           # interactions, EQ slider drag, master volume knob,
│                           # binaural preset selection, range sliders.
│
└── assets/
    ├── sounds/             # 9 looping MP3s (birds, cat, crickets, dripping,
    │                       # fire, ocean, rain, stream, wind)
    │
    └── fonts/              # PP Neue Machina woff2 — gitignored (commercial licence)
                            # Drop PPNeueMachina-subset.woff2 here before serving.
```

---

## Design tokens

Defined in `css/style.css` under `:root`:

| Token | Value | Used for |
|---|---|---|
| `--black` | `#121212` | Page background |
| `--white` | `#FAFAFA` | Primary text |
| `--grey-mid` | `#9A9A9A` | Secondary text, labels |
| `--grey-dark` | `#2a2a2a` | Tile backgrounds, knob track |
| `--signal` | `#FF2F00` | Accent — active states, fill arcs, tab underline |

Typefaces: **Satoshi** (body, loaded from Fontshare CDN) · **PP Neue Machina** (labels, local) · **Georgia italic** (title heading)

---

## Audio engine

`js/audioEngine.js` exposes `window.audioEngine` with these public methods:

```js
audioEngine.initialize()
audioEngine.setMasterVolume(0–100)

// Natural sounds
audioEngine.startNaturalSound(id, volume)   // id: 'ocean' | 'rain' | ...
audioEngine.stopNaturalSound(id)
audioEngine.updateNaturalSoundVolume(id, volume)

// Noise
audioEngine.startNoise(type, volume, eqValues)  // type: 'white' | 'pink' | 'brown'
audioEngine.stopNoise()
audioEngine.updateNoiseVolume(volume)
audioEngine.updateEQ(eqValues)              // eqValues: array of 6 numbers (0–100)

// Binaural beats
audioEngine.startBinauralBeat(brainwaveHz, carrierHz, volume)
audioEngine.stopBinauralBeat()
audioEngine.updateBinauralFrequencies(brainwaveHz, carrierHz)
audioEngine.updateBinauralVolume(volume)

audioEngine.cleanup()
```

---

## Local development

No server required for basic testing — open `index.html` directly in **Firefox** or **Safari** (both allow local file access). Chrome blocks local file XHR by default; use a simple server instead:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

