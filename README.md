# Tiny Harbor

A living miniature island village in three.js, shown like a tilt-shift diorama —
cozy, small, and full of little things worth rewatching.

No build step, no bundler, no assets: every hill, house, boat and bird is built
from procedural geometry with flat-shaded pastel materials. three.js 0.170.0 is
loaded through an import map from the jsDelivr CDN.

**Live demo:** <https://whobutsb.github.io/tiny-harbor/>

> **About this build** — Tiny Harbor was produced as a test run of
> **Qwen3.8** (`unsloth/Qwen3.8-Flash-Next-GGUF`, served locally through Unsloth
> Studio on a Mac Studio M5 Ultra, driven by the Hermes agent). The complete
> original brief is in [PROMPT.md](PROMPT.md); everything below — code, checks,
> screenshots — was generated and verified end-to-end by that run. See
> [Checks](#checks-performed) for the measured results.

## Run it

```bash
cd tiny-harbor
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Works on desktop and phone (touch drag to
orbit, pinch to zoom).

## Controls

| Input | Action |
| --- | --- |
| Drag / one-finger drag | Orbit around the island |
| Scroll / pinch | Zoom in and out |
| Idle for ~4 s | Slow auto-orbit kicks in |
| Click a boat, house, windmill, pier or the lighthouse | Camera glides close to it (moving boats are tracked) |
| Click open sea | Return to the wide establishing shot |

Bottom bar:

- **Day slider** — scrub time of day (the full cycle takes 60 s at 1×; playback
  resumes a few seconds after you let go).
- **Speed** — 0.5× / 1× / 2× / 4× simulation speed.
- **Weather** — Clear, Rain (dark clouds, streaks, sea ripples, wet sheen) or
  Snow (slow accumulation on roofs, icy sea, softer light).
- **Sound** — procedural WebAudio surf wash, wind and a distant harbor bell.
  Off by default; nothing plays until you toggle it.

## What's in there

- A round island with cliffs on one side, a sandy beach, grass, and a hill.
- A lighthouse whose beam sweeps the sea at night, a windmill that turns with
  the wind, and 12 houses whose windows light up one by one at dusk.
- Three little boats that sail loops around the island, slow down, dock at the
  pier, then put out again.
- Trees and grass tufts swaying in gusts (instanced), chimney smoke, circling
  gulls (they roost when it rains), foam where waves meet the beach, and a fish
  jumping now and then.
- A 60-second day: dawn mist on the water, bright noon, golden-hour paths on
  the sea, blue starlit nights with a moon glow and fireflies over the grass.

Rendering: stylized water shader (waves, shore foam, sun/moon glitter), BokehPass
tilt-shift depth of field, soft sun *and* moon shadows, hemisphere fill, gentle
bloom on lights at night, ACESFilmic tone mapping, sRGB output. `devicePixelRatio`
is capped at 2 and the scene targets 60 fps on a recent laptop.

## Video mode

Open

```
http://localhost:8080/?record=1
```

- The canvas is fixed at **1080×1350 (4:5)** and the UI is hidden.
- A scripted **40-second film** plays: dawn wide shot with mist → boats working
  the harbor → a close pass by the windmill at noon → sunset as the windows
  light up one by one → night with the lighthouse beam and fireflies → rain
  rolling in → a slow pull back to the whole island.
- The film runs on **fixed 1/60 s simulation steps** driven by a frame counter,
  and every random choice (house placement, tree scatter, gull paths, fish-jump
  timing) comes from a seeded RNG — two recordings of the same ticks match
  pixel-for-pixel. To capture it, record the page at 60 fps (e.g. Playwright
  screencast or `ffmpeg -f avfoundation` on macOS) and stop when
  `window.__tiny.filmDone === true`.

URL parameters:

| Param | Effect |
| --- | --- |
| `?record=1` | Video mode (fixed size, scripted film) |
| `?time=0.75` | Start at a given time of day (0–1, paused) |
| `?weather=rain` | Start in rain or snow (`clear`) |
| `?speed=2` | Simulation speed multiplier |
| `?maxtick=40` | With `record`: freeze the film after N seconds for exact-frame capture |

Developer hooks live on `window.__tiny` (`ready`, `fps`, `setDay(t)`,
`snapWeather(w)`, `filmT`, `filmDone`).

## Checks performed

All checks ran headless (Playwright + Chromium) against this repo, served with
`python3 -m http.server 8080`:

| Check | Result |
| --- | --- |
| Console errors / page errors (main page + record mode) | **0** |
| FPS @ 1280×800, `devicePixelRatio` 1 | **60 fps steady** (Apple M5 Ultra via ANGLE Metal; rAF-locked — frame budget never exceeded) |
| FPS under software rendering (SwiftShader, for reference) | 4 fps |
| Screenshots at dawn / noon / sunset / night / rain | in [`screenshots/`](screenshots/) |
| Record mode canvas | fixed **1080×1350**, UI hidden, scripted film advances |
| Determinism (`?record=1&maxtick=2`) | two fresh loads at the same tick produced **byte-identical PNGs** (sha256 match) |
| Boats loop → dock → leave | verified by sampling boat state machines at 4× speed |
| Tilt-shift profile (pixel stats) | mid-frame band ~6× sharper than foreground/background bands |

## GitHub Pages

This is a plain static site: Pages is enabled from the repository root on the
`main` branch, no build step. Push to `main` and the live site updates in a
minute or two.

## Project layout

```
index.html          import map, UI shell
PROMPT.md           the original build brief (verbatim)
src/main.js         scene assembly, day/night driver, interaction, record mode
src/world.js        shared state, seeded RNG, island shape math, sun/sky model
src/island.js       terrain (sand/grass/rock vertex colors), rocks, snow/wet states
src/water.js        stylized sea shader (waves, foam, glitter, rain ripples)
src/sky.js          sky dome, stars, moon, clouds, dawn mist ring
src/village.js      houses + chimneys + lit windows, pier, lamps, windmill, lighthouse
src/boats.js        three boats: loop → slow down → dock → leave
src/nature.js       swaying trees/grass, gulls, fish jumps, chimney smoke, fireflies
src/weatherfx.js    rain streaks and snowfall
src/audio.js        procedural WebAudio surf / wind / bell
src/film.js         the 40 s record-mode shot list
screenshots/        dawn / noon / sunset / night / rain + a record-mode frame
```
