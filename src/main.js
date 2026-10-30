// main.js — scene assembly, day/night driver, weather, interaction, UI, record mode.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { state, computeSky, DAY_LENGTH, shorePoint, PIER_TH } from './world.js';
import { buildIsland } from './island.js';
import { buildWater } from './water.js';
import { buildSky } from './sky.js';
import { buildVillage } from './village.js';
import { buildBoats } from './boats.js';
import { buildNature } from './nature.js';
import { buildWeatherFX } from './weatherfx.js';
import { createAudio } from './audio.js';
import { filmState, FILM_LENGTH } from './film.js';

const params = new URLSearchParams(location.search);
state.record = params.has('record');
const MAX_TICK = params.has('maxtick') ? parseFloat(params.get('maxtick')) : Infinity;
if (params.has('time')) { state.time = parseFloat(params.get('time')); state.paused = true; }
if (params.has('speed')) state.speed = parseFloat(params.get('speed'));
if (params.has('weather')) { state.weather = params.get('weather'); }
state.wind = 1;

// ---------- renderer ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const REC_W = 1080, REC_H = 1350;
function applySize() {
  if (state.record) {
    renderer.setPixelRatio(1);
    renderer.setSize(REC_W, REC_H, false);
    camera.aspect = REC_W / REC_H;
    camera.updateProjectionMatrix();
    const s = Math.min(innerWidth / REC_W, innerHeight / REC_H);
    renderer.domElement.style.width = `${Math.floor(REC_W * s)}px`;
    renderer.domElement.style.height = `${Math.floor(REC_H * s)}px`;
    composer.setSize(REC_W, REC_H);
  } else {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    composer.setSize(innerWidth, innerHeight);
  }
}

// ---------- scene ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#cfe0ea', 0.0042);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1300);
const HOME_POS = new THREE.Vector3(46, 30, 52), HOME_TGT = new THREE.Vector3(0, 3, 0);
camera.position.copy(HOME_POS);

// lights: one sun, one moon — both cast soft shadows
const sunLight = new THREE.DirectionalLight('#fff3dd', 2.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 220 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);
const moonLight = new THREE.DirectionalLight('#9db8e8', 0.5);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
Object.assign(moonLight.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 240 });
moonLight.shadow.bias = -0.0005; moonLight.shadow.normalBias = 0.04;
scene.add(moonLight, moonLight.target);
const hemi = new THREE.HemisphereLight('#cfe6f5', '#6f7a55', 0.7);
scene.add(hemi);

// ---------- world modules ----------
const island = buildIsland(scene);
const water = buildWater(scene);
const skyMod = buildSky(scene);
const village = buildVillage(scene);
const boats = buildBoats(scene);
const nature = buildNature(scene, village);
const weatherFX = buildWeatherFX(scene);

// ---------- post-processing: tilt-shift bokeh + soft bloom ----------
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 50, aperture: 0.0022, maxblur: 0.011 });
composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.25, 0.7, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// exclude soft particles from the DoF depth pass (they'd blur as squares)
const dofExclude = [...nature.dofExclude, ...weatherFX.dofExclude];
const _origBokehRender = bokeh.render.bind(bokeh);
bokeh.render = (r, wb, rb, dt, force) => {
  const saved = dofExclude.map(o => o.visible);
  dofExclude.forEach(o => (o.visible = false));
  _origBokehRender(r, wb, rb, dt, force);
  dofExclude.forEach((o, i) => (o.visible = saved[i]));
};

// ---------- controls & interaction ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TGT);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 170;
controls.maxPolarAngle = 1.52;
controls.autoRotateSpeed = 0.45;

let lastInteract = performance.now();
let focusRoot = null, glideHome = false;
const desiredPos = new THREE.Vector3(), desiredTgt = new THREE.Vector3();
function markIdle() { lastInteract = performance.now(); }
controls.addEventListener('start', () => { markIdle(); focusRoot = null; glideHome = false; controls.autoRotate = false; });
renderer.domElement.addEventListener('wheel', markIdle, { passive: true });

const raycaster = new THREE.Raycaster();
const pickList = [...village.pickables, ...boats.boats, water.mesh];
let downX = 0, downY = 0, downT = 0;
renderer.domElement.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; downT = performance.now(); });
renderer.domElement.addEventListener('pointerup', e => {
  if (state.record) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7 || performance.now() - downT > 450) return; // it was a drag
  const m = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(m, camera);
  const hits = raycaster.intersectObjects(pickList, true);
  const hit = hits.find(h => findRoot(h.object));
  if (hit) {
    focusRoot = findRoot(hit.object);
    glideHome = false;
  } else if (hits.some(h => h.object === water.mesh)) {
    focusRoot = null; glideHome = true; // clicked open sea → return home
  }
});
function findRoot(obj) {
  while (obj) { if (obj.userData.focusRoot) return obj.userData.focusRoot; obj = obj.parent; }
  return null;
}

// ---------- UI ----------
const ui = {
  time: document.getElementById('time'),
  clock: document.getElementById('clock'),
  speeds: document.getElementById('speeds'),
  weatherBtns: document.getElementById('weatherBtns'),
  sound: document.getElementById('soundBtn'),
};
const audio = createAudio();
ui.time.addEventListener('input', () => {
  state.time = ui.time.value / 1000;
  state.paused = true;
  clearTimeout(ui.time._t);
  ui.time._t = setTimeout(() => { state.paused = false; }, 4000); // resume the day after scrubbing
  markIdle();
});
ui.speeds.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.speed = parseFloat(b.dataset.speed);
  [...ui.speeds.querySelectorAll('button')].forEach(x => x.classList.toggle('on', x === b));
});
function setWeather(w) {
  state.weather = w;
  [...ui.weatherBtns.querySelectorAll('button')].forEach(x => x.classList.toggle('on', x.dataset.weather === w));
}
ui.weatherBtns.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setWeather(b.dataset.weather); markIdle(); } });
ui.sound.addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  ui.sound.textContent = state.soundOn ? 'Sound on' : 'Sound off';
  ui.sound.classList.toggle('on', state.soundOn);
  audio.setOn(state.soundOn);
});
if (params.has('weather')) setWeather(params.get('weather'));

// ---------- main loop ----------
const clockEl = ui.clock;
let last = performance.now(), filmTick = 0;
let fpsFrames = 0, fpsT0 = performance.now();
const api = window.__tiny = { ready: false, filmDone: false, fps: 0, state, modules: { boats },
  get filmT() { return filmTick; },
  setDay(t) { state.time = t; state.paused = true; },
  snapWeather(w) {
    setWeather(w);
    state.rainAmt = w === 'rain' ? 1 : 0;
    state.snowAmt = w === 'snow' ? 1 : 0;
  },
};

function frame(now) {
  requestAnimationFrame(frame);
  let dt, sdt;
  if (state.record) {
    dt = filmTick >= MAX_TICK ? 0 : 1 / 60;
    filmTick += dt;                 // deterministic fixed steps
    const fs = filmState(Math.min(filmTick, FILM_LENGTH));
    state.time = fs.time; state.paused = true;
    if (state.weather !== fs.weather) setWeather(fs.weather);
    camera.position.copy(fs.pos); controls.target.copy(fs.tgt);
    sdt = dt;
    if (fs.done) api.filmDone = true;
  } else {
    dt = Math.min(0.05, (now - last) / 1000);
    sdt = state.paused ? dt : dt * state.speed;
    if (!state.paused) state.time = (state.time + (dt * state.speed) / DAY_LENGTH) % 1;
  }
  last = now;

  // weather easing (rain fast, snow accumulates slowly)
  const rT = state.weather === 'rain' ? 1 : 0;
  state.rainAmt += (rT - state.rainAmt) * Math.min(1, dt * 0.9);
  if (state.weather === 'snow') state.snowAmt = Math.min(1, state.snowAmt + dt / 40);
  else state.snowAmt = Math.max(0, state.snowAmt - dt / 50);

  state.simTime += sdt;
  state.wind = 0.8 + 0.3 * Math.sin(state.simTime * 0.13) + 0.15 * Math.sin(state.simTime * 0.47);

  const sky = computeSky(state.time);

  // fog, lights
  scene.fog.color.copy(sky.fogColor).lerp(new THREE.Color('#5c6470'), state.rainAmt * 0.8);
  scene.fog.density = sky.fogDensity + state.rainAmt * 0.010 + state.snowAmt * 0.008;
  sunLight.position.copy(sky.sunDir).multiplyScalar(95);
  sunLight.target.position.set(0, 0, 0);
  sunLight.intensity = sky.sunI * (1 - state.rainAmt * 0.65) * (1 - state.snowAmt * 0.5);
  sunLight.color.copy(sky.sunColor);
  moonLight.position.copy(sky.moonDir).multiplyScalar(95);
  moonLight.intensity = sky.moonI * (1 - state.rainAmt * 0.7);
  hemi.color.copy(sky.hemiSky); hemi.groundColor.copy(sky.hemiGround);
  hemi.intensity = sky.hemiI * (1 - state.rainAmt * 0.4) + 0.05;

  skyMod.update(sky, state);
  water.update(sky, state);
  island.update(state.rainAmt, state.snowAmt);
  village.update(sky, state);
  boats.update(sdt, state);
  nature.update(sdt, state, sky);
  weatherFX.update(state);

  // camera focus glide / auto-orbit
  if (!state.record) {
    if (focusRoot) {
      const anchor = new THREE.Vector3(); focusRoot.getWorldPosition(anchor);
      const dist = focusRoot.userData.focusDist || 12;
      const outward = anchor.clone().setY(0);
      if (outward.lengthSq() < 4) outward.copy(camera.position).setY(0).sub(anchor).setY(0);
      outward.normalize();
      desiredTgt.copy(anchor).add(new THREE.Vector3(0, dist * 0.25, 0));
      desiredPos.copy(anchor).addScaledVector(outward, dist).setY(Math.max(anchor.y + dist * 0.45, 2.5));
      const k = 1 - Math.exp(-2.6 * dt);
      controls.target.lerp(desiredTgt, k);
      camera.position.lerp(desiredPos, k);
    } else if (glideHome) {
      const k = 1 - Math.exp(-2.2 * dt);
      controls.target.lerp(HOME_TGT, k);
      camera.position.lerp(HOME_POS, k);
      if (camera.position.distanceTo(HOME_POS) < 0.5) glideHome = false;
    }
    controls.autoRotate = !focusRoot && !glideHome && (now - lastInteract > 4000);
    controls.update();
  }

  // post params: focus on orbit target, tilt-shift aperture, night bloom
  const bokehU = bokeh.uniforms || bokeh.materialBokeh?.uniforms;
  if (bokehU) {
    bokehU.focus.value = camera.position.distanceTo(controls.target);
    bokehU.aperture.value = state.aperture ?? (state.record ? 0.0032 : 0.0024);
    bokehU.maxblur.value = state.maxblur ?? 0.011;
  }
  bloom.strength = 0.10 + sky.nightF * 0.55 + sky.golden * 0.18 + state.snowAmt * 0.08;

  composer.render();

  // UI readouts + fps
  if (document.activeElement !== ui.time) ui.time.value = Math.round(state.time * 1000);
  const hh = String(Math.floor(state.time * 24)).padStart(2, '0');
  const mm = String(Math.floor((state.time * 24 % 1) * 60)).padStart(2, '0');
  if (clockEl.textContent !== `${hh}:${mm}`) clockEl.textContent = `${hh}:${mm}`;

  fpsFrames++;
  if (now - fpsT0 > 500) { api.fps = Math.round((fpsFrames * 1000) / (now - fpsT0)); fpsFrames = 0; fpsT0 = now; }
  if (!api.ready) api.ready = true;
}

// ---------- go ----------
document.body.classList.toggle('record', state.record);
applySize();
addEventListener('resize', () => {
  if (state.record) { applySize(); return; }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applySize();
});
if (!state.record) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
requestAnimationFrame(frame);
