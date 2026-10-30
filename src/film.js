// film.js — deterministic 40 s movie for ?record=1 (fixed 60 fps steps).
import * as THREE from 'three';

const K = [
  // t, camera pos, look target, day-time
  { t: 0,  pos: [58, 34, 62],  tgt: [0, 4, 0],    time: 0.252 }, // dawn wide, mist
  { t: 7,  pos: [44, 22, 48],  tgt: [4, 3, 6],    time: 0.310 }, // drift in as sun climbs
  { t: 9,  pos: [24, 8, 34],   tgt: [14, 1.5, 18], time: 0.340 }, // cut to harbor, boats
  { t: 14, pos: [16, 6.5, 29], tgt: [13, 1.2, 17], time: 0.430 }, // slow push along the pier
  { t: 15, pos: [4, 13, 22],   tgt: [-7, 11, -6], time: 0.470 }, // cut to windmill pass (noon)
  { t: 21, pos: [-22, 13, 8],  tgt: [-7, 11, -6], time: 0.550 }, // arc past the blades
  { t: 22, pos: [34, 14, 26],  tgt: [5, 4, 8],    time: 0.690 }, // cut to village at sunset
  { t: 28, pos: [44, 10, 36],  tgt: [6, 4, 9],    time: 0.800 }, // windows light up one by one
  { t: 29, pos: [-36, 9, -14], tgt: [-17, 9, -10], time: 0.850 }, // cut to lighthouse at night
  { t: 33, pos: [-30, 8, -22], tgt: [-16, 9, -11], time: 0.895 }, // beam sweeps, fireflies
  { t: 34.5, pos: [-40, 11, -26], tgt: [-12, 7, -8], time: 0.905 }, // rain starts
  { t: 36, pos: [-48, 15, -24], tgt: [-6, 5, -4],  time: 0.915 },
  { t: 40, pos: [62, 42, 66],  tgt: [0, 4, 0],    time: 0.930 }, // slow pull back to the whole island
];

const ease = t => t * t * (3 - 2 * t);
const V = a => new THREE.Vector3(a[0], a[1], a[2]);

export const FILM_LENGTH = 40;

export function filmState(tSec) {
  let i = 0;
  while (i < K.length - 2 && K[i + 1].t <= tSec) i++;
  const a = K[i], b = K[i + 1];
  const k = ease(Math.min(1, Math.max(0, (tSec - a.t) / (b.t - a.t))));
  return {
    pos: V(a.pos).lerp(V(b.pos), k),
    tgt: V(a.tgt).lerp(V(b.tgt), k),
    time: THREE.MathUtils.lerp(a.time, b.time, k),
    weather: tSec >= 34 ? 'rain' : 'clear',
    done: tSec >= FILM_LENGTH,
  };
}
