// Visual effects, all pooled: tracers, impact sparks, blood puffs, smoke and
// the bomb blast. Nothing is allocated per frame; dead effects hide and wait.
import * as THREE from 'three';

const TRACERS = 24;
const SPARKS = 128;
const PUFFS = 40;

export function createEffects(scene) {
  // --- tracers: one Line each, fading fast ---
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerI = 0;
  function tracer(from, to) {
    const t = tracers[tracerI];
    tracerI = (tracerI + 1) % TRACERS;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.life = 0.07;
  }

  // --- sparks/blood: one Points cloud, particles with velocity + life ---
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  let sparkI = 0;
  function burst(p, n, color, speed) {
    for (let k = 0; k < n; k++) {
      const i = sparkI;
      sparkI = (sparkI + 1) % SPARKS;
      sparkPos[i * 3] = p.x;
      sparkPos[i * 3 + 1] = p.y;
      sparkPos[i * 3 + 2] = p.z;
      sparkVel[i * 3] = (Math.random() - 0.5) * speed;
      sparkVel[i * 3 + 1] = Math.random() * speed * 0.7;
      sparkVel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      sparkCol[i * 3] = color[0];
      sparkCol[i * 3 + 1] = color[1];
      sparkCol[i * 3 + 2] = color[2];
      sparkLife[i] = 0.4 + Math.random() * 0.3;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }
  function impact(p) { burst(p, 6, [1, 0.8, 0.4], 3); }
  function blood(p) { burst(p, 8, [0.6, 0.05, 0.05], 2); }

  // --- smoke: sprite puffs that swell and fade ---
  const smokeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(200,200,200,0.85)');
    grad.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    puffs.push({ s, life: 0, max: 1 });
  }
  let puffI = 0;
  function smokeCloud(p) {
    for (let k = 0; k < 10; k++) {
      const pf = puffs[puffI];
      puffI = (puffI + 1) % PUFFS;
      pf.s.position.set(p.x + (Math.random() - 0.5) * 3, 0.8 + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 3);
      pf.s.scale.setScalar(2.5 + Math.random() * 2);
      pf.max = 15;
      pf.life = 15;
      pf.s.visible = true;
    }
  }

  // --- explosion: flash sphere + light, both decaying ---
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffc266, transparent: true, opacity: 0 }));
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xff9a3d, 0, 30, 1.6);
  scene.add(flashLight);
  let flashLife = 0;
  function explosion(p) {
    burst(p, 40, [1, 0.6, 0.2], 8);
    flash.position.set(p.x, 1, p.z);
    flash.scale.setScalar(1);
    flash.visible = true;
    flash.material.opacity = 0.95;
    flashLight.position.set(p.x, 2, p.z);
    flashLight.intensity = 60;
    flashLife = 0.5;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    }
    let moved = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] = 0; }
      moved = true;
    }
    if (moved) sparkGeo.attributes.position.needsUpdate = true;
    for (const pf of puffs) {
      if (pf.life <= 0) { pf.s.visible = false; continue; }
      pf.life -= dt;
      pf.s.material.opacity = Math.min(0.75, (pf.life / pf.max) * 1.5);
      pf.s.scale.multiplyScalar(1 + dt * 0.06);
    }
    if (flashLife > 0) {
      flashLife -= dt;
      const k = Math.max(0, flashLife / 0.5);
      flash.scale.setScalar(1 + (1 - k) * 7);
      flash.material.opacity = k * 0.95;
      flashLight.intensity = k * 60;
      if (flashLife <= 0) flash.visible = false;
    }
  }
  return { tracer, impact, blood, smokeCloud, explosion, step };
}
