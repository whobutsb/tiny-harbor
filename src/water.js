// water.js — stylized sea: small waves, shore foam, sun/moon glitter, rain ripples.
import * as THREE from 'three';
import { RADIUS_GLSL } from './world.js';

export function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(760, 760, 150, 150);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color('#fff') },
    uSpecular: { value: 1.0 },       // sun/moon glitter strength
    uDayF: { value: 1 },
    uGolden: { value: 0 },
    uRain: { value: 0 },
    uSnow: { value: 0 },
    uDeep: { value: new THREE.Color('#1f6f92') },
    uShallow: { value: new THREE.Color('#4db8b0') },
    uSkyTint: { value: new THREE.Color('#bfe6f5') },
    uHorizon: { value: new THREE.Color('#d3ecf7') },
    fogColor: { value: new THREE.Color('#cccccc') },
    fogDensity: { value: 0.004 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uRain;
      varying vec3 vWorld;
      varying float vWave;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position;
        float w = sin(p.x*0.18 + uTime*1.1)*0.10 + sin(p.z*0.23 - uTime*0.9)*0.09
                + sin((p.x+p.z)*0.42 + uTime*1.7)*0.05;
        p.y += w * (1.0 + uRain*0.6);
        vWave = w;
        vec4 wp = modelMatrix * vec4(p,1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDayF, uGolden, uRain, uSnow, uSpecular;
      uniform vec3 uSunDir, uLightColor, uDeep, uShallow, uSkyTint, uHorizon;
      varying vec3 vWorld;
      varying float vWave;
      #include <fog_pars_fragment>
      ${RADIUS_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float r = length(vWorld.xz);
        float th = atan(vWorld.z, vWorld.x);
        float R = islandRadius(th);

        // animated normal from a few wave layers + rain chop
        float t = uTime;
        vec2 g = vec2(0.0);
        g += vec2(cos(vWorld.x*0.18 + t*1.1), cos(vWorld.z*0.23 - t*0.9)) * 0.09;
        g += vec2(cos((vWorld.x+vWorld.z)*0.42 + t*1.7)) * 0.10;
        if(uRain > 0.01){
          float chop = sin(vWorld.x*3.1 + t*7.0) * sin(vWorld.z*2.7 - t*6.3);
          g += vec2(chop) * 0.25 * uRain;
        }
        vec3 N = normalize(vec3(g.x, 1.0, g.y));

        // depth proxy by distance past shoreline
        float d = r - R;
        float depth = smoothstep(-1.0, 9.0, d);
        vec3 col = mix(uShallow, uDeep, depth);

        // sky reflection (fresnel-ish) with horizon→zenith gradient by reflection height
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 refl = reflect(-V, N);
        vec3 skyRefl = mix(uHorizon, uSkyTint, smoothstep(0.0, 0.5, refl.y));
        col = mix(col, skyRefl, 0.25 + fres*0.45);

        // golden-hour warm path on the water
        float sunSide = pow(max(dot(V, normalize(uSunDir - vec3(0.0, uSunDir.y, 0.0))), 0.0), 6.0);
        col += uGolden * sunSide * vec3(1.0, 0.55, 0.25) * 0.5;

        // specular glitter (sun by day, moon at night)
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 160.0) * 1.4 + pow(max(dot(N,H),0.0), 24.0)*0.18;
        col += uLightColor * spec * uSpecular * (uDayF*0.9 + (1.0-uDayF)*0.5);

        // foam band where waves meet the beach
        float wob = 0.7*sin(th*7.0 + t*1.3) + 0.4*sin(th*13.0 - t*0.8);
        const float PI2 = 6.28318530718;
        float rr = length(vWorld.xz); // (r already, keep readable)
        float band = abs(d - wob*0.4 - vWave*1.2);
        float foam = smoothstep(0.9, 0.05, band) * smoothstep(R+3.0, R-2.0, rr);

        // crest sparkle lines on waves outside the bay
        float crests = smoothstep(0.86, 1.0, sin(d*1.2 - t*1.6 + th*5.0)) * 0.12 * (1.0-depth*0.4);
        col = mix(col, vec3(0.97,0.99,1.0), clamp(foam + crests, 0.0, 1.0) * (0.2 + uDayF*0.45));

        // rain: dull the water, add ripple speckle
        if(uRain > 0.01){
          float rip = sin(r*9.0 - t*8.0) * sin(th*40.0 + t*3.0);
          col += smoothstep(0.92, 1.0, rip) * 0.10 * uRain;
          col *= (1.0 - 0.25*uRain);
        }
        // snow: icy desaturated tint
        col = mix(col, vec3(0.75,0.82,0.88), uSnow*0.35);

        // night darkening
        col *= (0.28 + 0.72*uDayF) + 0.1;

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.name = 'sea';
  scene.add(mesh);

  function update(sky, state) {
    uniforms.uTime.value = state.simTime;
    // sun by day, moon glitter at night (moon is opposite dir)
    const useSun = sky.dayF > 0.15;
    uniforms.uSunDir.value.copy(useSun ? sky.sunDir : sky.moonDir);
    uniforms.uLightColor.value.copy(useSun ? sky.sunColor : new THREE.Color('#cfe0ff'));
    uniforms.uSpecular.value = useSun ? sky.dayF : sky.nightF;
    uniforms.uDayF.value = sky.dayF;
    uniforms.uGolden.value = sky.golden;
    uniforms.uRain.value = state.rainAmt;
    uniforms.uSnow.value = state.snowAmt;
    uniforms.uSkyTint.value.copy(sky.zenith).lerp(new THREE.Color('#ffffff'), 0.15);
    uniforms.uHorizon.value.copy(sky.horizon);
    uniforms.uDeep.value.set(useSun ? '#1f6f92' : '#0c2a3d').lerp(new THREE.Color('#4a5a68'), state.rainAmt * 0.7);
    uniforms.uShallow.value.set('#63c8c4').lerp(new THREE.Color('#7d95a3'), Math.max(state.rainAmt, state.snowAmt*0.6) * 0.7);
  }

  return { mesh, update };
}
