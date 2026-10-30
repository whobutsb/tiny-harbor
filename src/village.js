// village.js — 12 houses with chimneys & lit windows, pier, street lamps, windmill, lighthouse.
import * as THREE from 'three';
import { islandHeight, islandRadius, shorePoint, PIER_TH, CLIFF_TH, HILL_X, HILL_Z, mulberry32, SEED, smoothstep } from './world.js';

const WALLS = ['#f2e3c8', '#e8cdb4', '#dfe6ea', '#f0d9c0', '#dce8d8', '#e7dcef', '#f5efe2'];
const ROOFS = ['#c96f4a', '#a4574b', '#7a8ca3', '#8a6f52', '#6e8f7d', '#b0766a', '#5d6d8f'];

export function buildVillage(scene, opts = {}) {
  const rng = mulberry32(SEED ^ 0x77e1);
  const group = new THREE.Group();
  scene.add(group);

  const windowMats = [];   // emissive materials that light up at dusk (staggered)
  const roofMats = [];     // for snow coverage
  const woodMats = [];     // for wet sheen
  const pickables = [];    // click-focus targets
  const chimneyTops = [];  // world positions for smoke

  function tagPick(obj, name, dist) {
    obj.traverse(o => { o.userData.focusName = name; o.userData.focusRoot = obj; });
    obj.userData.focusDist = dist;
    pickables.push(obj);
  }

  // gable roof prism: base w×d at y=0, ridge along z at height hR
  function gableRoofGeo(w, d, hR) {
    const hw = w / 2 * 1.28, hd = d / 2 * 1.1;
    const P = [
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [0, hR, -hd], [0, hR, hd],
    ].flat();
    const I = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 3, 4, 5, 3, 5, 2, 0, 3, 2, 0, 2, 1];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    return g;
  }

  // ---------------- houses ----------------
  const houseSpots = [];
  let guard = 0;
  while (houseSpots.length < 12 && guard++ < 600) {
    const th = -0.35 + rng() * 2.7;            // village side, away from cliffs
    const R = islandRadius(th);
    const r = R * (0.45 + rng() * 0.38);
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const h = islandHeight(x, z);
    if (h < 1.0 || h > 6.2) continue;
    // slope check
    const hE = islandHeight(x + 1.5, z), hN = islandHeight(x, z + 1.5);
    if (Math.abs(h - hE) > 0.8 || Math.abs(h - hN) > 0.8) continue;
    if (houseSpots.some(p => Math.hypot(p.x - x, p.z - z) < 6.2)) continue;
    houseSpots.push({ x, z, h });
  }

  for (let i = 0; i < houseSpots.length; i++) {
    const { x, z, h } = houseSpots[i];
    const house = new THREE.Group();
    house.position.set(x, h - 0.12, z);
    house.rotation.y = Math.atan2(-x, -z) + (rng() - 0.5) * 1.4; // face the sea roughly

    const w = 2.6 + rng() * 1.8, d = 2.4 + rng() * 1.6, wallH = 2.0 + rng() * 1.3;
    const wallMat = new THREE.MeshStandardMaterial({ color: WALLS[i % WALLS.length], flatShading: true, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    wall.position.y = wallH / 2; wall.castShadow = wall.receiveShadow = true;
    house.add(wall);

    // gable roof (triangular prism, ridge along depth)
    const roofMat = new THREE.MeshStandardMaterial({ color: ROOFS[i % ROOFS.length], flatShading: true, roughness: 0.85, side: THREE.DoubleSide });
    roofMats.push({ mat: roofMat, base: new THREE.Color(ROOFS[i % ROOFS.length]) });
    const hR = Math.max(w, d) * 0.52;
    const roof = new THREE.Mesh(gableRoofGeo(w, d, hR), roofMat);
    roof.position.y = wallH;
    roof.castShadow = true;
    house.add(roof);

    // chimney
    const chW = 0.55;
    const chim = new THREE.Mesh(new THREE.BoxGeometry(chW, wallH * 0.9 + hR * 0.7, chW),
      new THREE.MeshStandardMaterial({ color: '#b8ac9e', flatShading: true }));
    const chimX = w * 0.28, chimZ = -d * 0.3;
    chim.position.set(chimX, (wallH + hR * 0.7) / 2 + 0.2, chimZ);
    chim.castShadow = true;
    house.add(chim);
    chimneyTops.push({ house, local: new THREE.Vector3(chimX, wallH + hR * 0.75 + 0.45, chimZ) });

    // door + windows (emissive at night)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2),
      new THREE.MeshStandardMaterial({ color: '#6a4f3c', roughness: 0.9 }));
    door.position.set(-w * 0.22, 0.6, d / 2 + 0.01);
    house.add(door);

    const nWin = 2 + (rng() < 0.5 ? 1 : 0);
    for (let wI = 0; wI < nWin; wI++) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#3a3f4a', emissive: new THREE.Color('#ffcf7e'), emissiveIntensity: 0, roughness: 0.6,
      });
      windowMats.push({ mat, thresh: rng() * 0.92 }); // stagger one-by-one at dusk
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), mat);
      const side = wI % 2;
      if (side === 0) win.position.set(w * (wI < 2 ? -0.28 : 0.3), wallH * 0.62, d / 2 + 0.015);
      else { win.position.set(w / 2 + 0.015, wallH * 0.62, d * 0.12); win.rotation.y = Math.PI / 2; }
      house.add(win);
    }

    tagPick(house, 'house', 9);
    group.add(house);
  }

  // ---------------- pier ----------------
  const woodMat = new THREE.MeshStandardMaterial({ color: '#8a6a4d', flatShading: true, roughness: 0.9 });
  woodMats.push(woodMat);
  const pier = new THREE.Group();
  const pierDir = shorePoint(PIER_TH, 1.02);
  const pierEnd = shorePoint(PIER_TH, 1.5);
  const pierLen = pierEnd.distanceTo(pierDir);
  const nPlanks = Math.floor(pierLen / 0.85);
  for (let i = 0; i <= nPlanks; i++) {
    const t = i / nPlanks;
    const p = pierDir.clone().lerp(pierEnd, t);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.7), woodMat);
    plank.position.set(p.x, 0.55, p.z);
    plank.lookAt(pierEnd.x, 0.55, pierEnd.z);
    plank.rotateY(Math.PI / 2);
    plank.castShadow = plank.receiveShadow = true;
    pier.add(plank);
    if (i % 2 === 0) {
      for (const sgn of [-1, 1]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.2, 6), woodMat);
        const off = new THREE.Vector3().subVectors(pierEnd, pierDir).normalize().cross(new THREE.Vector3(0, 1, 0)).multiplyScalar(sgn * 0.8);
        pile.position.set(p.x + off.x, -0.4, p.z + off.z);
        pile.castShadow = true;
        pier.add(pile);
      }
    }
  }
  // lamps on the pier + beach path
  const lampState = [];
  const lampPositions = [
    pierDir.clone().lerp(pierEnd, 0.45).setY(0.62),
    pierEnd.clone().setY(0.62),
    shorePoint(PIER_TH, 0.92).setY(islandHeight(shorePoint(PIER_TH, 0.92).x, shorePoint(PIER_TH, 0.92).z)),
    shorePoint(PIER_TH + 0.35, 0.86).setY(islandHeight(shorePoint(PIER_TH + 0.35, 0.86).x, shorePoint(PIER_TH + 0.35, 0.86).z)),
    shorePoint(PIER_TH - 0.4, 0.9).setY(islandHeight(shorePoint(PIER_TH - 0.4, 0.9).x, shorePoint(PIER_TH - 0.4, 0.9).z)),
  ];
  for (const p of lampPositions) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 6),
      new THREE.MeshStandardMaterial({ color: '#3d4450', flatShading: true }));
    pole.position.y = 1.15; pole.castShadow = true; lamp.add(pole);
    const globeMat = new THREE.MeshBasicMaterial({ color: '#000000' });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), globeMat);
    globe.position.y = 2.4; lamp.add(globe);
    lampState.push({ globeMat, thresh: rng() * 0.6 });
    lamp.position.copy(p);
    group.add(lamp);
  }
  tagPick(pier, 'pier', 11);

  // ---------------- windmill on the hill ----------------
  const mill = new THREE.Group();
  const mx = HILL_X, mz = HILL_Z, my = islandHeight(mx, mz);
  mill.position.set(mx, my - 0.2, mz);
  mill.rotation.y = PIER_TH; // blades face the harbor and the default camera
  const towerMat = new THREE.MeshStandardMaterial({ color: '#e9e2d4', flatShading: true, roughness: 0.9 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.7, 5.6, 9), towerMat);
  tower.position.y = 2.8; tower.castShadow = true; mill.add(tower);
  const capMat = new THREE.MeshStandardMaterial({ color: '#8a5a44', flatShading: true });
  roofMats.push({ mat: capMat, base: new THREE.Color('#8a5a44') });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 9), capMat);
  cap.position.y = 6.2; cap.castShadow = true; mill.add(cap);
  const blades = new THREE.Group();
  blades.position.set(0, 5.6, 1.7);
  for (let b = 0; b < 4; b++) {
    const arm = new THREE.Group();
    arm.rotation.z = (b / 4) * Math.PI * 2;
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 0.16), woodMat);
    spar.position.y = 2.3; spar.castShadow = true; arm.add(spar);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 3.4),
      new THREE.MeshStandardMaterial({ color: '#f4efe4', side: THREE.DoubleSide, roughness: 0.95 }));
    sail.position.set(0.52, 2.5, 0.06); arm.add(sail);
    blades.add(arm);
  }
  mill.add(blades);
  tagPick(mill, 'windmill', 14);
  group.add(mill);

  // ---------------- lighthouse on the cliff ----------------
  const light = new THREE.Group();
  const lth = CLIFF_TH + 0.12;
  const lp = shorePoint(lth, 0.78);
  light.position.set(lp.x, islandHeight(lp.x, lp.z) - 0.3, lp.z);
  const ltowerMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', flatShading: true, roughness: 0.85 });
  const ltower = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.8, 7.2, 12), ltowerMat);
  ltower.position.y = 3.6; ltower.castShadow = true; light.add(ltower);
  for (let s = 0; s < 3; s++) { // red stripes
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.52 - s * 0.14, 1.62 - s * 0.14, 0.7, 12),
      new THREE.MeshStandardMaterial({ color: '#c95f4f', flatShading: true }));
    stripe.position.y = 1.9 + s * 2.1; stripe.castShadow = true; light.add(stripe);
  }
  const lampRoomMat = new THREE.MeshBasicMaterial({ color: '#000000' });
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.2, 12), lampRoomMat);
  lampRoom.position.y = 7.8; light.add(lampRoom);
  const lroof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.1, 12),
    new THREE.MeshStandardMaterial({ color: '#a4574b', flatShading: true }));
  lroof.position.y = 8.9; lroof.castShadow = true; light.add(lroof);

  // rotating beam (visible at night): additive cone + spotlight
  const beamGroup = new THREE.Group();
  beamGroup.position.y = 7.8;
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffe9b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.6, 42, 16, 1, true), beamMat);
  cone.rotation.z = Math.PI / 2; // point along +x
  cone.position.x = 21;
  beamGroup.add(cone);
  const beamLight = new THREE.SpotLight('#ffe9b0', 0, 70, 0.22, 0.6, 1.2);
  beamLight.position.set(0, 0, 0);
  beamLight.target.position.set(40, -2, 0);
  beamGroup.add(beamLight, beamLight.target);
  light.add(beamGroup);
  tagPick(light, 'lighthouse', 17);
  group.add(light);

  // small breakwater wall near harbor
  const wallStones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({ color: '#8f9aa3', flatShading: true }), 26);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const th = PIER_TH + 0.55 - t * 1.1;
    const p = shorePoint(th, 1.12 + 0.06 * Math.sin(t * 9));
    m4.makeTranslation(p.x, islandHeight(p.x, p.z) * 0.4 + 0.1, p.z);
    wallStones.setMatrixAt(i, m4);
  }
  wallStones.castShadow = wallStones.receiveShadow = true;
  group.add(wallStones);

  // ---------------- per-frame updates ----------------
  const warm = new THREE.Color('#ffcf7e');
  const white = new THREE.Color('#eef4f6');
  const black = new THREE.Color('#000000');
  function update(sky, st) {
    // windows light up one by one at dusk
    for (const { mat, thresh } of windowMats) {
      const on = smoothstep(thresh, thresh + 0.12, sky.lampOn);
      mat.emissiveIntensity = on * 1.9;
      mat.color.set('#3a3f4a').lerp(warm, on * 0.6);
    }
    for (const { globeMat, thresh } of lampState) {
      const on = smoothstep(thresh, thresh + 0.15, sky.lampOn);
      globeMat.color.copy(black).lerp(new THREE.Color('#ffe6ae'), on * (0.5 + sky.nightF * 0.9));
    }
    // windmill blades turn with the wind
    blades.rotation.z = st.simTime * (0.35 + st.wind * 0.25);
    // lighthouse beam sweeps at night
    const beamOn = smoothstep(0.1, 0.45, sky.nightF) * (1 - st.rainAmt * 0.35);
    beamGroup.rotation.y = st.simTime * 0.7;
    beamMat.opacity = beamOn * 0.20;
    beamLight.intensity = beamOn * 900;
    lampRoomMat.color.copy(black).lerp(new THREE.Color('#fff2c8'), sky.lampOn);

    // snow accumulates on roofs; wood gets a wet sheen in rain
    for (const { mat, base } of roofMats) mat.color.copy(base).lerp(white, st.snowAmt * 0.92);
    const wet = Math.max(st.rainAmt, st.snowAmt * 0.25);
    for (const m of woodMats) m.roughness = 0.9 - wet * 0.5;
  }

  return { group, pickables, chimneyTops, windowMats, update, houseSpots };
}
