// sky.js — gradient sky dome, sun disc, moon + glow, stars, drifting clouds, dawn mist.
import * as THREE from 'three';
import { mulberry32, SEED } from './world.js';

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSky(scene) {
  const rng = mulberry32(SEED ^ 0x9c31);

  // ---- sky dome ----
  const skyUniforms = {
    uZenith: { value: new THREE.Color('#63b5e8') },
    uHorizon: { value: new THREE.Color('#d3ecf7') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff3dd') },
    uDayF: { value: 1 },
    uRain: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(480, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith, uHorizon, uSunDir, uSunColor;
        uniform float uDayF, uRain;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.12, 1.0);
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
          // sun glow near horizon direction
          float d = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          float glow = pow(d, 6.0)*0.35 + pow(d, 220.0)*1.6;
          col += uSunColor * glow * (uDayF*0.8 + 0.2) * step(uSunDir.y, 0.45);
          // sun disc
          float disc = smoothstep(0.9993, 0.9996, d) * step(-0.05, uSunDir.y);
          col = mix(col, vec3(1.0, 0.98, 0.9), disc);
          // rain: flat grey sheet
          vec3 grey = mix(vec3(0.42,0.46,0.52), vec3(0.16,0.18,0.24), 1.0-uDayF);
          col = mix(col, grey, uRain*0.75);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // ---- stars ----
  const starCount = 1300;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    let v;
    do { v = new THREE.Vector3(rng() * 2 - 1, rng(), rng() * 2 - 1).normalize(); } while (v.y < 0.04);
    sp.set([v.x * 460, v.y * 460, v.z * 460], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({
    color: '#e8f0ff', size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // ---- moon with soft glow ----
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 20, 16),
    new THREE.MeshBasicMaterial({ color: '#fff6dc' }),
  );
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,246,215,0.8)', 'rgba(255,246,215,0)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  moonGlow.scale.setScalar(70);
  const moonGroup = new THREE.Group();
  moonGroup.add(moon, moonGlow);
  scene.add(moonGroup);

  // ---- clouds: flattened pastel puffs that darken in rain ----
  const cloudGroup = new THREE.Group();
  const cloudMats = [];
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, flatShading: true });
    cloudMats.push(mat);
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const g = new THREE.SphereGeometry(4 + rng() * 5, 7, 5);
      const m = new THREE.Mesh(g, mat);
      m.position.set((p - puffs / 2) * (4.5 + rng() * 2), rng() * 1.6, rng() * 3 - 1.5);
      m.scale.y = 0.55;
      cl.add(m);
    }
    const th = rng() * Math.PI * 2;
    const R = 90 + rng() * 90;
    cl.position.set(Math.cos(th) * R, 46 + rng() * 22, Math.sin(th) * R);
    cl.userData = { th, R, spd: 0.008 + rng() * 0.01 };
    cloudGroup.add(cl);
  }
  scene.add(cloudGroup);

  // ---- dawn mist ring around the island ----
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vP;
      void main(){ vUv = uv; vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity, uTime; varying vec2 vUv; varying vec3 vP;
      void main(){
        float r = length(vP.xy); // ring geometry lies in its local plane before rotation
        float band = smoothstep(1.0, 1.6, r) * smoothstep(2.4, 1.8, r);
        float sw = 0.75 + 0.25*sin(uTime*0.35 + vP.x*0.05 + vP.y*0.04);
        gl_FragColor = vec4(vec3(0.93,0.95,0.98), band * uOpacity * sw);
      }`,
  });
  const mist = new THREE.Mesh(new THREE.RingGeometry(14, 62, 64), mistMat);
  mist.rotation.x = -Math.PI / 2;
  mist.position.y = 0.9;
  scene.add(mist);

  function update(skyState, state) {
    skyUniforms.uZenith.value.copy(skyState.zenith);
    skyUniforms.uHorizon.value.copy(skyState.horizon).lerp(new THREE.Color('#565e6b'), state.rainAmt * 0.8);
    skyUniforms.uSunDir.value.copy(skyState.sunDir);
    skyUniforms.uSunColor.value.copy(skyState.sunColor);
    skyUniforms.uDayF.value = skyState.dayF;
    skyUniforms.uRain.value = state.rainAmt;

    starMat.opacity = skyState.nightF * 0.95 * (1 - state.rainAmt * 0.9) * (1 - state.snowAmt * 0.7);
    stars.rotation.y = state.simTime * 0.004;

    moonGroup.position.copy(skyState.moonDir).multiplyScalar(380);
    const moonVis = skyState.nightF * (1 - state.rainAmt);
    moon.visible = moonVis > 0.02;
    moon.material.color.setHex(0xfff6dc).multiplyScalar(0.4 + moonVis * 0.6);

    for (const cl of cloudGroup.children) {
      cl.userData.th += cl.userData.spd * 0.016;
      cl.position.x = Math.cos(cl.userData.th) * cl.userData.R;
      cl.position.z = Math.sin(cl.userData.th) * cl.userData.R;
      cl.position.y = lerpn(cl.position.y, 46 + (state.rainAmt + state.snowAmt) * -14, 0.02);
    }
    const cloudTint = new THREE.Color('#ffffff')
      .lerp(new THREE.Color('#5c6470'), state.rainAmt)
      .lerp(new THREE.Color('#aab4c4'), state.snowAmt * 0.8)
      .multiplyScalar(0.35 + skyState.dayF * 0.65 + skyState.golden * 0.2);
    for (const m of cloudMats) {
      m.color.copy(cloudTint).lerp(new THREE.Color('#ffc9a0'), skyState.golden * 0.4);
      m.opacity = 0.55 + (state.rainAmt + state.snowAmt) * 0.4;
    }

    mistMat.uniforms.uOpacity.value = Math.exp(-Math.pow((state.time - 0.27) / 0.035, 2)) * 0.85 + state.snowAmt * 0.15;
    mistMat.uniforms.uTime.value = state.simTime;
  }
  const lerpn = (a, b, t) => a + (b - a) * t;

  return { update };
}
