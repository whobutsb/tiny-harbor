// world.js — shared state, seeded RNG, island math, sun/sky model.
import * as THREE from 'three';

export const SEED = 20261029;
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DAY_LENGTH = 60; // seconds per full day at speed 1x

export const state = {
  time: 0.30,          // 0..1 (0 = midnight, .25 sunrise, .5 noon, .75 sunset)
  speed: 1,
  weather: 'clear',    // clear | rain | snow
  rainAmt: 0,          // eased 0..1
  snowAmt: 0,          // eased 0..1 (also drives coverage)
  simTime: 0,          // animation clock (seconds, advances with speed)
  paused: false,       // freeze day time but keep animating
  soundOn: false,
  record: false,
  aperture: null,      // optional DoF override (tuning/testing)
  maxblur: null,
};

export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------- island shape (shared with water shader GLSL) ----------
// Radius of the shoreline as a function of angle. Keep in sync with WATER_GLSL.
export const RADIUS_GLSL = `
float islandRadius(float th){
  return 26.0 + 3.0*sin(3.0*th+1.7) + 2.0*sin(5.0*th+0.35);
}`;
export function islandRadius(th) {
  return 26 + 3 * Math.sin(3 * th + 1.7) + 2 * Math.sin(5 * th + 0.35);
}

// Height of the terrain at (x,z). Beach → plateau → cliffs on one side, hill.
export const CLIFF_TH = 3.45;   // cliff sector center angle
export const HILL_X = -7, HILL_Z = -6;
export const PIER_TH = 0.9;     // harbor angle

export function islandHeight(x, z) {
  const r = Math.hypot(x, z);
  const th = Math.atan2(z, x);
  const R = islandRadius(th);
  const u = r / R;
  let h = THREE.MathUtils.lerp(-2.4, 3.0, smoothstep(1.06, 0.80, u));

  // cliff ridge on one side
  let dth = Math.atan2(Math.sin(th - CLIFF_TH), Math.cos(th - CLIFF_TH));
  const cAmt = Math.exp(-(dth * dth) / (2 * 0.55 * 0.55));
  const band = smoothstep(1.02, 0.86, u) * smoothstep(0.55, 0.78, u);
  h += 9.0 * cAmt * band;

  // hill with windmill
  const hg = Math.exp(-(((x - HILL_X) ** 2 + (z - HILL_Z) ** 2) / (2 * 6.5 * 6.5)));
  h += 8.0 * hg * smoothstep(1.0, 0.75, u);

  // gentle rolling noise on land only
  const land = smoothstep(1.0, 0.85, u);
  h += land * (0.35 * Math.sin(x * 0.55) * Math.sin(z * 0.48) +
               0.18 * Math.sin(x * 1.3 + 2.0) * Math.cos(z * 1.1));
  return h;
}

export function shorePoint(th, rMul = 1) {
  const R = islandRadius(th) * rMul;
  return new THREE.Vector3(Math.cos(th) * R, 0, Math.sin(th) * R);
}

// ---------- sun / sky model ----------
const _c = new THREE.Color();
export function computeSky(t) {
  const a = (t - 0.25) * Math.PI * 2;
  const elev = Math.sin(a);
  const dayF = smoothstep(-0.06, 0.18, elev);
  const nightF = 1 - dayF;
  const golden = Math.exp(-Math.pow((elev - 0.02) / 0.28, 2)) * (elev > -0.35 ? 1 : 0);

  const sunDir = new THREE.Vector3(Math.cos(a), elev, -0.35 * Math.cos(a)).normalize();
  const moonDir = sunDir.clone().negate();

  const nightZen = new THREE.Color('#070d24'), dayZen = new THREE.Color('#63b5e8');
  const nightHor = new THREE.Color('#1c2a55'), dayHor = new THREE.Color('#d3ecf7');
  const gold = new THREE.Color('#ffab6e');

  const zenith = _c.clone().copy(nightZen).lerp(dayZen, dayF);
  const horizon = new THREE.Color().copy(nightHor).lerp(dayHor, dayF).lerp(gold, golden * 0.85);
  const fogColor = horizon.clone().lerp(zenith, 0.35);

  const sunColor = new THREE.Color('#ff9d5c').lerp(new THREE.Color('#fff3dd'), smoothstep(0.02, 0.35, elev));

  return {
    elev, dayF, nightF, golden, sunDir, moonDir, zenith, horizon, fogColor, sunColor,
    sunI: dayF * 2.9,
    moonI: nightF * 0.6,
    hemiSky: horizon.clone().lerp(zenith, 0.5).multiplyScalar(0.9 + dayF * 0.4),
    hemiGround: new THREE.Color('#141a2c').lerp(new THREE.Color('#7d8a5e'), dayF),
    hemiI: 0.14 + dayF * 0.71,
    lampOn: smoothstep(0.12, -0.08, elev), // 0 by day → 1 at night (windows & lamps)
    fogDensity: 0.0042 + Math.exp(-Math.pow((t - 0.27) / 0.035, 2)) * 0.022,
  };
}

// shared uniforms for wind sway (used by trees/grass shaders)
export const envUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};
