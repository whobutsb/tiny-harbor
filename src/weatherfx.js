// weatherfx.js — falling rain streaks and drifting snow around the island.
import * as THREE from 'three';
import { mulberry32, SEED } from './world.js';

export function buildWeatherFX(scene) {
  const rng = mulberry32(SEED ^ 0x5eed);
  const BOX = 120, TOP = 60;

  // ---- rain: fast falling points with vertical stretch via shader ----
  const RN = 2600;
  const rp = new Float32Array(RN * 3), rs = new Float32Array(RN);
  for (let i = 0; i < RN; i++) {
    rp.set([(rng() - 0.5) * BOX, rng() * TOP, (rng() - 0.5) * BOX], i * 3);
    rs[i] = rng();
  }
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rGeo.setAttribute('aSeed', new THREE.BufferAttribute(rs, 1));
  rGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 25, 0), 110);
  const rainUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const rain = new THREE.Points(rGeo, new THREE.ShaderMaterial({
    uniforms: rainUniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; varying float vA;
      void main(){
        vec3 p = position;
        float spd = 26.0 + aSeed*14.0;
        p.y = mod(p.y - uTime*spd, 60.0);
        p.x += sin(uTime*3.0 + aSeed*20.0)*0.3 + 1.5; // slight wind slant
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = (1.6 + aSeed*1.4) * (180.0 / -mv.z);
        vA = 0.35 + aSeed*0.3;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;      // stretch into a streak
        float a = smoothstep(0.5, 0.1, abs(d.x)) * smoothstep(0.5, 0.0, abs(d.y*0.30));
        if(a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.75,0.82,0.92), a * vA * uOpacity);
      }`,
  }));
  scene.add(rain);

  // ---- snow: slow tumbling flakes ----
  const SN = 1800;
  const sp = new Float32Array(SN * 3), ss = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    sp.set([(rng() - 0.5) * BOX, rng() * TOP, (rng() - 0.5) * BOX], i * 3);
    ss[i] = rng();
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sGeo.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 25, 0), 110);
  const snowUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const snow = new THREE.Points(sGeo, new THREE.ShaderMaterial({
    uniforms: snowUniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y - uTime*(1.6 + aSeed*1.6), 60.0);
        p.x += sin(uTime*0.8 + aSeed*40.0)*2.2 + uTime*0.6;
        p.z += cos(uTime*0.7 + aSeed*30.0)*2.0;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_PointSize = (2.2 + aSeed*3.0) * (150.0 / -mv.z);
        vA = 0.5 + aSeed*0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d);
        if(a < 0.02) discard;
        gl_FragColor = vec4(vec3(1.0), a * vA * uOpacity);
      }`,
  }));
  scene.add(snow);

  function update(st) {
    rainUniforms.uTime.value = st.simTime;
    snowUniforms.uTime.value = st.simTime;
    rainUniforms.uOpacity.value = st.rainAmt;
    snowUniforms.uOpacity.value = st.snowAmt;
    rain.visible = st.rainAmt > 0.01;
    snow.visible = st.snowAmt > 0.01;
  }

  return { update, dofExclude: [rain, snow] };
}
