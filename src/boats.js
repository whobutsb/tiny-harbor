// boats.js — three small boats that sail loops, slow down, dock at the pier, then leave.
import * as THREE from 'three';
import { islandRadius, shorePoint, PIER_TH, mulberry32, SEED, smoothstep } from './world.js';

const HULL_COLORS = ['#c95f4f', '#4f7fc9', '#4fa06b'];

function makeBoat(color) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
  // tapered hull: box with the bow vertices pulled in
  const hullGeo = new THREE.BoxGeometry(2.6, 0.7, 1.1, 2, 1, 1);
  const pos = hullGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (x > 1.0) { pos.setZ(i, z * 0.25); pos.setY(i, y * 0.7); }      // pointy bow
    if (y < 0) { pos.setX(i, x * 0.8); pos.setZ(i, z * 0.7); }          // narrow below waterline
  }
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  g.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.8),
    new THREE.MeshStandardMaterial({ color: '#efe6d2', flatShading: true }));
  deck.position.set(-0.6, 0.55, 0); deck.castShadow = true; g.add(deck);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: '#7a5c3e', flatShading: true }));
  mast.position.set(0.35, 1.5, 0); mast.castShadow = true; g.add(mast);

  // triangular sail (facing ±z)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0, 2.1); shape.quadraticCurveTo(0.9, 1.1, 1.5, 0.05); shape.lineTo(0, 0);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: '#f7f2e6', side: THREE.DoubleSide, roughness: 0.95 }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0.42, 0.5, 0.02);
  sail.castShadow = true;
  g.add(sail);

  // little flag
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.28),
    new THREE.MeshStandardMaterial({ color: '#e0b64f', side: THREE.DoubleSide }));
  flag.position.set(0.62, 2.55, 0); flag.rotation.y = Math.PI / 2;
  g.add(flag);

  g.userData.focusName = 'boat';
  g.traverse(o => { o.userData.focusName = 'boat'; o.userData.focusRoot = g; });
  g.userData.focusDist = 8;
  return g;
}

export function buildBoats(scene) {
  const rng = mulberry32(SEED ^ 0x33bd);
  const dockTh = PIER_TH + 0.16;   // where boats queue at the pier
  const boats = [];

  for (let i = 0; i < 3; i++) {
    const mesh = makeBoat(HULL_COLORS[i]);
    scene.add(mesh);
    boats.push({
      mesh,
      th: dockTh + (i + 1) * (Math.PI * 2 / 3), // start spread around the island
      dir: i === 1 ? -1 : 1,
      spd: 0.045 + i * 0.008,        // rad/s cruise speed (always forward)
      state: 'sail',           // sail | docked
      timer: 4 + rng() * 10,   // time until first docking (staggered)
      dockOff: (i - 1) * 2.6,  // queue along the pier
      lane: 5.5 + i * 1.7,     // loop distance offshore
      bobPhase: rng() * 6.28,
    });
  }

  function boatPos(th, lane, dockOff) {
    const R = islandRadius(th) + lane;
    let x = Math.cos(th) * R, z = Math.sin(th) * R;
    if (Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th - dockTh), Math.cos(th - dockTh)))) < 4) {
      // slide along the pier line when docking
      const tangent = new THREE.Vector3(-Math.sin(dockTh), 0, Math.cos(dockTh));
      x += tangent.x * dockOff; z += tangent.z * dockOff;
    }
    return new THREE.Vector3(x, 0.12, z);
  }

  function update(dt, st) {
    for (const b of boats) {
      if (b.state === 'docked') {
        b.timer -= dt;
        if (b.timer <= 0) { b.state = 'sail'; b.timer = 18 + rng() * 26; }
      } else {
        // slow down when approaching the dock angle
        let dth = Math.atan2(Math.sin(dockTh - b.th), Math.cos(dockTh - b.th));
        const ahead = dth * b.dir;               // >0 means dock still ahead
        const near = smoothstep(0.9, 0.05, Math.abs(ahead)) * (ahead > -0.02 ? 1 : 0);
        const speed = b.spd * (1 - near * 0.93);
        b.th += b.dir * speed * dt;          // full loop ≈ 2–2.5 min at 1×
        if (Math.abs(ahead) < 0.018 && near > 0.5) {
          b.state = 'docked';
          b.timer = 8 + rng() * 14;
          b.th = dockTh - b.dir * 0.012;
        } else {
          b.timer -= dt; // countdown toward next docking attempt handled by speed profile
        }
      }
      const p = boatPos(b.th, b.lane, b.dockOff);
      const bob = Math.sin(st.simTime * 1.7 + b.bobPhase) * 0.07;
      b.mesh.position.set(p.x, 0.12 + bob, p.z);
      // heading: tangent of the loop (or along pier when docked)
      let heading;
      if (b.state === 'docked') {
        heading = dockTh + Math.PI / 2 * b.dir;
      } else {
        const q = boatPos(b.th + 0.02 * b.dir, b.lane, b.dockOff);
        heading = Math.atan2(-(q.z - p.z), q.x - p.x);
      }
      b.mesh.rotation.y = heading;
      b.mesh.rotation.z = Math.sin(st.simTime * 1.3 + b.bobPhase) * 0.05;
      b.mesh.rotation.x = Math.sin(st.simTime * 1.9 + b.bobPhase * 2) * 0.03;
    }
  }

  return { boats: boats.map(b => b.mesh), states: boats, update };
}
