// island.js — terrain disc with vertex colors (sand/grass/rock), rocks, snow & wetness.
import * as THREE from 'three';
import { islandRadius, islandHeight, CLIFF_TH, PIER_TH, smoothstep, lerp, mulberry32, SEED } from './world.js';

const SAND = new THREE.Color('#e8d9ab');
const SAND_WET = new THREE.Color('#c9b98a');
const GRASS_A = new THREE.Color('#6fa855');
const GRASS_B = new THREE.Color('#84b761');
const ROCK = new THREE.Color('#9d9488');
const ROCK_DK = new THREE.Color('#7f7669');

export function buildIsland(scene) {
  const rng = mulberry32(SEED ^ 0x51ab);
  const RINGS = 90, SEGS = 160, RMAX = 40;

  const positions = [];
  const colors = [];
  const indices = [];
  const baseColors = []; // pre-snow colors

  for (let i = 0; i <= RINGS; i++) {
    const r = (i / RINGS) * RMAX;
    for (let j = 0; j <= SEGS; j++) {
      const th = (j / SEGS) * Math.PI * 2;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const h = islandHeight(x, z);
      positions.push(x, h, z);

      // classify
      const R = islandRadius(th);
      const u = r / R;
      let dth = Math.atan2(Math.sin(th - CLIFF_TH), Math.cos(th - CLIFF_TH));
      const cliffAmt = Math.exp(-(dth * dth) / (2 * 0.55 * 0.55));
      // slope proxy: compare with a point slightly outward
      const hOut = islandHeight(Math.cos(th) * (r + 1.2), Math.sin(th) * (r + 1.2));
      const slope = Math.abs(h - hOut);

      let c;
      if (u > 0.93 || h < 0.55) {
        c = SAND.clone().lerp(GRASS_A, smoothstep(0.7, 1.6, h));
      } else if (slope > 1.05 && cliffAmt > 0.25) {
        c = ROCK.clone().lerp(ROCK_DK, rng());
      } else {
        c = GRASS_A.clone().lerp(GRASS_B, rng() * 0.6 + 0.2 * Math.sin(x * 0.9));
        if (slope > 1.3) c.lerp(ROCK, smoothstep(1.3, 2.0, slope));
      }
      // darken underwater skirt a bit
      if (h < -0.4) c.lerp(new THREE.Color('#5d6f5a'), 0.5);
      baseColors.push(c.r, c.g, c.b);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const a = i * (SEGS + 1) + j, b = a + 1;
      const c = a + (SEGS + 1), d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  // ---- rocks scattered on the beach and cliff base ----
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#9a9186', flatShading: true, roughness: 1 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 46);
  rocks.castShadow = rocks.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let placed = 0, guard = 0;
  while (placed < 46 && guard++ < 400) {
    const th = rng() * Math.PI * 2;
    const R = islandRadius(th);
    const r = R * (0.92 + rng() * 0.18);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th - PIER_TH), Math.cos(th - PIER_TH)))) < 7 && r > R) continue; // keep pier clear
    const y = islandHeight(x, z);
    if (y > 2.2) continue;
    const sc = 0.3 + rng() * 0.9;
    e.set(rng() * 3, rng() * 3, rng() * 3); q.setFromEuler(e);
    v.set(x, y - sc * 0.25, z); s.set(sc, sc * (0.6 + rng() * 0.4), sc);
    m4.compose(v, q, s);
    rocks.setMatrixAt(placed++, m4);
  }
  rocks.count = placed;
  scene.add(rocks);

  // ---- per-frame: snow coverage & wet sheen ----
  const colorAttr = geo.getAttribute('color');
  const heights = new Float32Array(positions.length / 3);
  for (let i = 0; i < heights.length; i++) heights[i] = positions[i * 3 + 1];
  let lastSnow = -1, lastWet = -1;
  const white = new THREE.Color('#eef4f6');

  function update(rainAmt, snowAmt) {
    if (Math.abs(snowAmt - lastSnow) > 0.003 || Math.abs(rainAmt - lastWet) > 0.01) {
      lastSnow = snowAmt; lastWet = rainAmt;
      const arr = colorAttr.array;
      for (let i = 0; i < heights.length; i++) {
        const cov = snowAmt * smoothstep(-0.1, 0.8, heights[i]) * 0.9;
        let r = lerp(baseColors[i * 3], white.r, cov);
        let g = lerp(baseColors[i * 3 + 1], white.g, cov);
        let b = lerp(baseColors[i * 3 + 2], white.b, cov);
        const wet = rainAmt * 0.35; // darken when wet
        arr[i * 3] = r * (1 - wet); arr[i * 3 + 1] = g * (1 - wet); arr[i * 3 + 2] = b * (1 - wet * 0.8);
      }
      colorAttr.needsUpdate = true;
    }
    mat.roughness = lerp(0.95, 0.42, Math.max(rainAmt, snowAmt * 0.3)); // wet sheen in rain
  }

  return { mesh, rocks, update };
}
