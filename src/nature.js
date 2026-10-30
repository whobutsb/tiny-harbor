// nature.js — swaying trees & grass (InstancedMesh), gulls, jumping fish, chimney smoke, fireflies.
import * as THREE from 'three';
import { islandHeight, islandRadius, mulberry32, SEED, envUniforms, smoothstep } from './world.js';

// inject wind sway into a standard material used by an InstancedMesh
function addSway(mat, amp) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = envUniforms.uTime;
    shader.uniforms.uWind = envUniforms.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */`#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iOrg = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float ph = iOrg.x * 0.9 + iOrg.z * 1.7;
        float gust = 0.7 + 0.45 * sin(uTime * 0.35 + iOrg.x * 0.08) + 0.25 * sin(uTime * 1.6 + ph);
        float hh = max(transformed.y, 0.0);
        transformed.x += sin(uTime * (1.4 + fract(sin(iOrg.x * 12.9898) * 43758.5453) * 0.9) + ph) * ${amp.toFixed(3)} * hh * gust * uWind;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${(amp * 0.5).toFixed(3)} * hh * gust * uWind;
      #endif`);
  };
  mat.customProgramCacheKey = () => 'sway' + amp;
}

function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildNature(scene, village) {
  const rng = mulberry32(SEED ^ 0xa115);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();

  // ---------------- trees ----------------
  const treeSpots = [];
  guard: for (let i = 0; i < 900 && treeSpots.length < 64; i++) {
    const th = rng() * Math.PI * 2;
    const R = islandRadius(th);
    const r = R * (0.3 + rng() * 0.6);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const h = islandHeight(x, z);
    if (h < 1.2 || h > 9) continue;
    if (village.houseSpots?.some(p => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
    for (const t of treeSpots) if (Math.hypot(t.x - x, t.z - z) < 3.2) continue guard;
    treeSpots.push({ x, z, h, sc: 0.75 + rng() * 0.8 });
  }
  const N = treeSpots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.6, 6);
  trunkGeo.translate(0, 0.8, 0);
  const trunkMat = addSway(new THREE.MeshLambertMaterial({ color: '#7a5a3e', flatShading: true }), 0.02);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const leafGeo = new THREE.ConeGeometry(1.35, 3.1, 7);
  leafGeo.translate(0, 3.0, 0);
  const leafMat = addSway(new THREE.MeshLambertMaterial({ color: '#5d9b52', flatShading: true }), 0.05);
  const leafMat2 = addSway(new THREE.MeshLambertMaterial({ color: '#74ac5c', flatShading: true }), 0.05);
  const leavesA = new THREE.InstancedMesh(leafGeo, leafMat, N);
  const leavesB = new THREE.InstancedMesh(new THREE.SphereGeometry(1.05, 6, 5), leafMat2, N);
  trunks.castShadow = leavesA.castShadow = leavesB.castShadow = true;
  trunks.receiveShadow = leavesA.receiveShadow = true;
  treeSpots.forEach((t, i) => {
    e.set(0, rng() * 6.28, 0); q.setFromEuler(e);
    v.set(t.x, t.h - 0.15, t.z); s.setScalar(t.sc);
    m4.compose(v, q, s); trunks.setMatrixAt(i, m4); leavesA.setMatrixAt(i, m4);
    s.set(t.sc * (0.9 + rng() * 0.3), t.sc * (0.8 + rng() * 0.4), t.sc * (0.9 + rng() * 0.3));
    m4.compose(v, q, s); leavesB.setMatrixAt(i, m4);
  });
  scene.add(trunks, leavesA, leavesB);

  // ---------------- grass tufts ----------------
  const GN = 850;
  const gGeo = new THREE.ConeGeometry(0.16, 0.75, 4, 1, true);
  gGeo.translate(0, 0.37, 0);
  const grassMat = addSway(new THREE.MeshLambertMaterial({ color: '#8abf68', flatShading: true, side: THREE.DoubleSide }), 0.22);
  const grass = new THREE.InstancedMesh(gGeo, grassMat, GN);
  let gi = 0, gguard = 0;
  while (gi < GN && gguard++ < 6000) {
    const th = rng() * Math.PI * 2;
    const R = islandRadius(th);
    const r = R * (0.25 + rng() * 0.72);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const h = islandHeight(x, z);
    if (h < 0.8 || h > 10) continue;
    e.set((rng() - 0.5) * 0.3, rng() * 6.28, (rng() - 0.5) * 0.3); q.setFromEuler(e);
    v.set(x, h - 0.05, z); s.set(1, 0.7 + rng() * 0.9, 1);
    m4.compose(v, q, s); grass.setMatrixAt(gi++, m4);
  }
  grass.count = gi;
  scene.add(grass);

  // ---------------- chimney smoke (one Points system) ----
  const PER_CH = 26;
  const chimneys = village.chimneyTops || [];
  village.group.updateMatrixWorld(true);
  const origins = chimneys.map(({ house, local }) => house.localToWorld(local.clone()));
  const SM = origins.length * PER_CH;
  const smokePos = new Float32Array(SM * 3); // dummy; shader computes position
  const aOrigin = new Float32Array(SM * 3), aSeed = new Float32Array(SM);
  for (let c = 0; c < origins.length; c++) {
    for (let p = 0; p < PER_CH; p++) {
      const i = c * PER_CH + p;
      aOrigin.set([origins[c].x, origins[c].y, origins[c].z], i * 3);
      aSeed[i] = rng();
    }
  }
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  smokeGeo.setAttribute('aOrigin', new THREE.BufferAttribute(aOrigin, 3));
  smokeGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  smokeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 80);
  const smokeUniforms = { uTime: envUniforms.uTime, uOpacity: { value: 0.5 }, uMap: { value: softDotTexture() } };
  const smoke = new THREE.Points(smokeGeo, new THREE.ShaderMaterial({
    uniforms: smokeUniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute vec3 aOrigin; attribute float aSeed; uniform float uTime;
      varying float vAge;
      void main(){
        float rate = 0.10 + fract(aSeed*7.31)*0.05;
        float age = fract(uTime*rate + aSeed);
        vAge = age;
        vec3 p = aOrigin;
        p.y += age * 4.6;
        p.x += sin(age*5.0 + aSeed*40.0)*0.35 + age*1.3;   // drift with wind (+x)
        p.z += cos(age*4.0 + aSeed*30.0)*0.3 + age*0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (5.0 + age*26.0) * (140.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; uniform sampler2D uMap; varying float vAge;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        float a = t.a * smoothstep(0.0, 0.12, vAge) * (1.0 - vAge) * uOpacity;
        gl_FragColor = vec4(vec3(0.92, 0.93, 0.95), a);
      }`,
  }));
  scene.add(smoke);

  // ---------------- fireflies over the grass (night) ----------------
  const FF = 140;
  const ffPos = new Float32Array(FF * 3), ffSeed = new Float32Array(FF);
  for (let i = 0; i < FF; i++) {
    const th = rng() * Math.PI * 2, R = islandRadius(th), r = R * (0.35 + rng() * 0.55);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    ffPos.set([x, islandHeight(x, z) + 0.6 + rng() * 1.6, z], i * 3);
    ffSeed[i] = rng();
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('aSeed', new THREE.BufferAttribute(ffSeed, 1));
  ffGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 60);
  const fireflyUniforms = { uTime: envUniforms.uTime, uNight: { value: 0 }, uMap: { value: softDotTexture() } };
  const fireflies = new THREE.Points(ffGeo, new THREE.ShaderMaterial({
    uniforms: fireflyUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; varying float vGlow;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*0.7 + aSeed*50.0)*1.2;
        p.y += sin(uTime*1.1 + aSeed*80.0)*0.5;
        p.z += cos(uTime*0.6 + aSeed*60.0)*1.2;
        vGlow = smoothstep(0.3, 0.9, sin(uTime*(1.5+aSeed*2.0) + aSeed*90.0));
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = (3.5 + vGlow*4.0) * (110.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; uniform sampler2D uMap; varying float vGlow;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.45), t.a * vGlow * uNight);
      }`,
  }));
  scene.add(fireflies);

  // ---------------- seagulls ----------------
  const gulls = [];
  const gullMat = new THREE.MeshLambertMaterial({ color: '#f4f6f8', flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const wingGeo = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.5, 0.18, -0.5, 1.7, 0.1, 0.45], 3));
      geo.computeVertexNormals(); return geo;
    };
    const wl = new THREE.Mesh(wingGeo(), gullMat);
    const wr = new THREE.Mesh(wingGeo(), gullMat); wr.scale.z = -1;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.8, 5), gullMat);
    body.rotation.z = Math.PI / 2; g.add(body, wl, wr);
    const bird = { g, wl, wr, th: rng() * 6.28, R: 30 + rng() * 14, y: 9 + rng() * 7, spd: 0.13 + rng() * 0.1, flap: 5 + rng() * 3, bobP: rng() * 6 };
    gulls.push(bird); scene.add(g);
  }

  // ---------------- jumping fish + splash ring ----------------
  const fish = new THREE.Group();
  const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#9fc4d8', flatShading: true }));
  fishBody.scale.set(1.7, 0.7, 0.5);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), fishBody.material);
  tail.rotation.z = Math.PI / 2; tail.position.x = -0.65; tail.scale.set(1, 1, 0.35);
  fish.add(fishBody, tail);
  fish.visible = false; scene.add(fish);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#eaf7ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), ringMat);
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const jump = { t: -1, next: 4 + rng() * 6, pos: new THREE.Vector3(), dur: 1.1 };

  // ---------------- updates ----------------
  function update(dt, st, sky) {
    envUniforms.uTime.value = st.simTime;
    envUniforms.uWind.value = st.wind * (1 + st.rainAmt * 0.8);

    smokeUniforms.uOpacity.value = 0.28 + sky.lampOn * 0.35 + st.snowAmt * 0.2;
    fireflyUniforms.uNight.value = smoothstep(0.35, 0.75, sky.nightF) * (1 - st.rainAmt) * (1 - st.snowAmt);

    for (const b of gulls) {
      b.th += b.spd * dt;
      const x = Math.cos(b.th) * b.R, z = Math.sin(b.th) * b.R;
      const y = b.y + Math.sin(st.simTime * 0.5 + b.bobP) * 1.2;
      b.g.position.set(x, y, z);
      b.g.rotation.y = -b.th + (b.spd > 0 ? Math.PI / 2 : -Math.PI / 2);
      const flap = Math.sin(st.simTime * b.flap + b.bobP) * 0.7;
      b.wl.rotation.x = flap; b.wr.rotation.x = flap;
      b.g.visible = sky.dayF > 0.15 && st.rainAmt < 0.4; // gulls roost in the rain
    }

    // fish jumps every ~6-14 s
    if (jump.t < 0) {
      jump.next -= dt;
      if (jump.next <= 0) {
        const th = rng() * Math.PI * 2;
        const r = islandRadius(th) + 4 + rng() * 8;
        jump.pos.set(Math.cos(th) * r, 0, Math.sin(th) * r);
        jump.t = 0; fish.visible = true;
      }
    } else {
      jump.t += dt / jump.dur;
      const k = jump.t;
      if (k >= 1) { jump.t = -1; jump.next = 5 + rng() * 9; fish.visible = false; ringMat.opacity = 0; }
      else {
        fish.position.set(jump.pos.x, Math.sin(k * Math.PI) * 1.6 - 0.15, jump.pos.z);
        fish.rotation.z = -Math.cos(k * Math.PI) * 1.4 + (rng() - 0.5) * 0.02;
        fish.visible = k > 0.08 && k < 0.92;
        if (k > 0.9 || k < 0.1) {
          ring.position.set(jump.pos.x, 0.06, jump.pos.z);
          const kk = k < 0.5 ? k * 2 : (1 - k) * 2;
          ring.scale.setScalar(0.5 + kk * 2.2);
          ringMat.opacity = 0.7 * (1 - kk);
        } else ringMat.opacity = 0;
      }
    }
  }

  return { update, dofExclude: [smoke, fireflies, ring] };
}
