# Original Prompt

Build "Tiny Harbor", a living miniature island village in three.js, shown like a tilt-shift diorama. It should feel cozy and full of small details people want to rewatch, in the style of Miyazaki.

## TECH

- Plain static site, no build step: index.html, src/*.js, README.md. Serve with: python3 -m http.server 8080
- three.js 0.170.0 through an import map: "three" = https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js and "three/addons/" = https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/. No other dependencies. No external models or images: build every object from procedural geometry with flat-shaded, soft pastel materials.

## THE ISLAND

- A round island on a calm sea: cliffs on one side, a sandy beach, grass, a small hill.
- A harbor with a wooden pier and three small boats that sail loops around the island, slow down and dock, then leave again.
- A lighthouse on the cliff, a windmill on the hill with turning blades, and about 12 houses with chimneys and lit windows.
- Trees and grass tufts that sway in the wind (InstancedMesh). Smoke rising from chimneys. Seagulls circling. Foam lines where waves meet the beach. A fish jumps now and then.

## DAY AND NIGHT

- A full day cycle in 60 seconds by default: dawn mist, bright noon, golden sunset, blue night with stars and a moon.
- Sky gradient and light color follow the sun. Windows and street lamps turn on one by one at dusk.
- At night the lighthouse sweeps a soft beam across the sea, and fireflies appear over the grass.

## WEATHER

- Buttons for clear, rain and snow. Rain brings darker clouds, falling drops, ripples on the sea and wet, shiny streets. Snow slowly covers the roofs in white.

## LOOK

- Tilt-shift depth of field (BokehPass) so it looks like a real miniature. Soft shadows from the sun and moon, hemisphere fill light, gentle bloom on lights at night, ACESFilmic tone mapping, sRGB output.
- A simple stylized water shader with small waves and soft reflections.
- Target 60 fps on a recent laptop. Cap devicePixelRatio at 2.

## INTERACTION

- Drag to orbit, scroll or pinch to zoom, and a slow auto-orbit when idle.
- Click a boat, house, windmill or the lighthouse to glide the camera close to it, and click empty sea to return.
- A small UI: time of day slider, speed (0.5x to 4x), weather buttons, and a sound toggle (procedural WebAudio waves, wind and a distant bell, off by default).
- Works on desktop and phone.

## VIDEO MODE (?record=1)

- Fixed 1080x1350 canvas (4:5), UI hidden.
- A scripted 40-second film: dawn wide shot with mist, boats leaving the harbor, close pass by the windmill at noon, sunset as the windows light up, night with the lighthouse beam and fireflies, rain starting, then a slow pull back to the whole island.
- Deterministic, so two recordings match.

## CHECKS (run them, then report)

- Open it in a headless browser and confirm there are no console errors.
- Save screenshots to screenshots/ at dawn, noon, sunset, night and in the rain.
- Measure and report fps on this machine.
- README: how to run, the controls and the video mode.
