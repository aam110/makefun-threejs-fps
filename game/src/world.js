// Yard 9: an original desert container yard at dusk. One box list drives both
// the meshes and the colliders, so what you see is what blocks you. Textures
// are procedural canvas art: no asset files, no network.
import * as THREE from 'three';

// Every solid: x/z center, w/d footprint, h height, kind picks the material.
// The map is flat (ground y=0); crates and containers are full-height blockers.
// y0 (optional) lifts a box off the ground — stacked containers sit on the
// ones below them; colliders and LOS both use the box's real y-range.
const BOXES = [
  // perimeter (h 3.2)
  { x: 0, z: -22.3, w: 61.2, d: 0.6, h: 3.2, kind: 'wall' },
  { x: 0, z: 22.3, w: 61.2, d: 0.6, h: 3.2, kind: 'wall' },
  { x: -30.3, z: 0, w: 0.6, d: 45.2, h: 3.2, kind: 'wall' },
  { x: 30.3, z: 0, w: 0.6, d: 45.2, h: 3.2, kind: 'wall' },
  // mid blocks: two halls with the mid lane between them (x -4..4)
  { x: -8, z: -1, w: 8, d: 6, h: 3.2, kind: 'block' },
  { x: 8, z: -1, w: 8, d: 6, h: 3.2, kind: 'block' },
  // A-long gate wall with a gap at x -19..-17
  { x: -22, z: 6, w: 8, d: 0.6, h: 2.6, kind: 'wall' },
  { x: -14.5, z: 6, w: 3, d: 0.6, h: 2.6, kind: 'wall' },
  // B alley: containers forming a dog-leg
  { x: 17, z: 7, w: 6, d: 2.4, h: 2.6, kind: 'containerB' },
  { x: 23, z: 2, w: 2.4, d: 6, h: 2.6, kind: 'containerA' },
  // site A: container + crates + a stacked container for height
  { x: -22, z: -14, w: 6, d: 2.4, h: 2.6, kind: 'containerA' },
  { x: -22, z: -14, w: 6, d: 2.4, h: 2.6, y0: 2.6, kind: 'containerB' },
  { x: -16, z: -17, w: 2, d: 2, h: 2, kind: 'crate' },
  { x: -25, z: -9, w: 2, d: 2, h: 1, kind: 'crate' },
  // site B: container + crates + a stacked container for height
  { x: 22, z: -14, w: 6, d: 2.4, h: 2.6, kind: 'containerB' },
  { x: 22, z: -14, w: 6, d: 2.4, h: 2.6, y0: 2.6, kind: 'containerA' },
  { x: 16, z: -17, w: 2, d: 2, h: 2, kind: 'crate' },
  { x: 25, z: -9, w: 2, d: 2, h: 1, kind: 'crate' },
  // mid cover crates
  { x: -2, z: 8, w: 2, d: 2, h: 1, kind: 'crate' },
  { x: 2, z: -7, w: 2, d: 2, h: 1, kind: 'crate' },
  { x: -6, z: 12, w: 2, d: 2, h: 2, kind: 'crate' },
  { x: 6, z: 12, w: 2, d: 2, h: 2, kind: 'crate' },
  { x: -12, z: -10, w: 2, d: 2, h: 1, kind: 'crate' },
  { x: 12, z: -10, w: 2, d: 2, h: 1, kind: 'crate' },
  // barrels (AABB-approximated)
  { x: -26, z: 14, w: 0.8, d: 0.8, h: 1.1, kind: 'barrel' },
  { x: 26, z: 14, w: 0.8, d: 0.8, h: 1.1, kind: 'barrel' },
  { x: -18, z: -6, w: 0.8, d: 0.8, h: 1.1, kind: 'barrel' },
  { x: 18, z: -6, w: 0.8, d: 0.8, h: 1.1, kind: 'barrel' },
];
export const SITES = { A: { x: -20, z: -12, r: 4.5 }, B: { x: 20, z: -12, r: 4.5 } };
export const SPAWNS = {
  atk: [{ x: -2, z: 19 }, { x: 0, z: 20 }, { x: 2, z: 19 }],
  def: [{ x: -2, z: -19 }, { x: 0, z: -20 }, { x: 2, z: -19 }],
};
// Waypoint graph for bots: name -> {x, z, links[]}. Routes are BFS paths.
export const WAYPOINTS = {
  atkSpawn: { x: 0, z: 18, links: ['atkMid', 'aLong1', 'bShort1'] },
  atkMid: { x: 0, z: 12, links: ['atkSpawn', 'midSouth', 'aLong1', 'bShort1'] },
  midSouth: { x: 0, z: 6, links: ['atkMid', 'midGap'] },
  midGap: { x: 0, z: 0, links: ['midSouth', 'midNorth', 'midWest', 'midEast'] },
  midNorth: { x: 0, z: -6, links: ['midGap', 'defMid'] },
  midWest: { x: -8, z: 0, links: ['midGap', 'aLong3'] },
  midEast: { x: 8, z: 0, links: ['midGap', 'bShort3'] },
  aLong1: { x: -14, z: 12, links: ['atkSpawn', 'atkMid', 'aLong2'] },
  aLong2: { x: -20, z: 6, links: ['aLong1', 'aLong3'] },
  aLong3: { x: -24, z: 0, links: ['aLong2', 'midWest', 'aSite'] },
  aSite: { x: -20, z: -12, links: ['aLong3', 'aHold1', 'aHold2', 'defA'] },
  aHold1: { x: -24, z: -8, links: ['aSite'] },
  aHold2: { x: -16, z: -16, links: ['aSite'] },
  bShort1: { x: 14, z: 12, links: ['atkSpawn', 'atkMid', 'bShort2'] },
  bShort2: { x: 20, z: 6, links: ['bShort1', 'bShort3'] },
  bShort3: { x: 24, z: 0, links: ['bShort2', 'midEast', 'bSite'] },
  bSite: { x: 20, z: -12, links: ['bShort3', 'bHold1', 'bHold2', 'defB'] },
  bHold1: { x: 24, z: -8, links: ['bSite'] },
  bHold2: { x: 16, z: -16, links: ['bSite'] },
  defSpawn: { x: 0, z: -18, links: ['defMid', 'defA', 'defB'] },
  defMid: { x: 0, z: -12, links: ['defSpawn', 'midNorth'] },
  defA: { x: -12, z: -14, links: ['defSpawn', 'aSite'] },
  defB: { x: 12, z: -14, links: ['defSpawn', 'bSite'] },
};

function canvasTexture(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(ctx, s, base, dots, n) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dots[i % dots.length];
    ctx.globalAlpha = 0.12 + (i % 5) * 0.05;
    ctx.fillRect((i * 37) % s, (i * 53) % s, 2 + (i % 3), 2 + (i % 2));
  }
  ctx.globalAlpha = 1;
}

export function createWorld(scene) {
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: canvasTexture(256, (g, s) => {
      speckle(g, s, '#b98d5e', ['#a87c4e', '#c99a68', '#8f6a42'], 900);
      // large wear blotches so the sand reads as ground, not wallpaper
      for (let i = 0; i < 12; i++) {
        const bx = (i * 67 + 31) % s;
        const by = (i * 113 + 17) % s;
        const br = 26 + (i % 4) * 12;
        const grad = g.createRadialGradient(bx, by, 2, bx, by, br);
        grad.addColorStop(0, i % 2 ? 'rgba(90,62,36,0.16)' : 'rgba(210,170,120,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(bx - br, by - br, br * 2, br * 2);
      }
    }, 10, 8), roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ map: canvasTexture(128, (g, s) => {
      speckle(g, s, '#8a7f70', ['#7a6f60', '#998d7c'], 260);
      g.fillStyle = '#a89a80'; g.fillRect(0, 0, s, 7); // pale cap along the top
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
      for (let x = 0; x <= s; x += 32) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, s); g.stroke(); }
    }, 2, 1), roughness: 0.95 }),
    block: new THREE.MeshStandardMaterial({ map: canvasTexture(128, (g, s) => {
      speckle(g, s, '#6e6a63', ['#5e5a54', '#7d7870'], 260);
      g.strokeStyle = '#4a4640'; g.lineWidth = 3;
      for (let y = 42; y < s; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
      // hazard band along the top edge
      g.fillStyle = '#c87f2e'; g.fillRect(0, 8, s, 12);
      g.fillStyle = '#2a2724';
      for (let x = -12; x < s + 12; x += 24) {
        g.beginPath(); g.moveTo(x, 20); g.lineTo(x + 12, 8); g.lineTo(x + 18, 8); g.lineTo(x + 6, 20); g.fill();
      }
    }, 2, 1), roughness: 0.95 }),
    crate: new THREE.MeshStandardMaterial({ map: canvasTexture(128, (g, s) => { g.fillStyle = '#7d5a33'; g.fillRect(0, 0, s, s); g.strokeStyle = '#5d3f1e'; g.lineWidth = 6; for (let y = 0; y <= s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); } g.strokeRect(3, 3, s - 6, s - 6); }), roughness: 0.9 }),
    containerA: new THREE.MeshStandardMaterial({ map: canvasTexture(128, (g, s) => { g.fillStyle = '#3f6d6a'; g.fillRect(0, 0, s, s); g.fillStyle = '#35605d'; for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 7, s); }), roughness: 0.7, metalness: 0.25 }),
    containerB: new THREE.MeshStandardMaterial({ map: canvasTexture(128, (g, s) => { g.fillStyle = '#a34d28'; g.fillRect(0, 0, s, s); g.fillStyle = '#8d3f20'; for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 7, s); }), roughness: 0.7, metalness: 0.25 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.6, metalness: 0.4 }),
  };
  const colliders = [];
  const shootables = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  for (const b of BOXES) {
    const mesh = b.kind === 'barrel'
      ? new THREE.Mesh(cylGeo, mats.barrel)
      : new THREE.Mesh(boxGeo, mats[b.kind] || mats.wall);
    if (b.kind !== 'barrel') mesh.scale.set(b.w, b.h, b.d);
    mesh.position.set(b.x, (b.y0 || 0) + b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    shootables.push(mesh);
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, bottom: b.y0 || 0, top: (b.y0 || 0) + b.h });
  }

  // Site markers: ground ring + floating letter + accent light + light beam.
  const siteLights = {};
  for (const [name, s] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.25, s.r, 48), new THREE.MeshBasicMaterial({ color: name === 'A' ? 0x35d0ba : 0xff9a3d, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.05, s.z);
    scene.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: name === 'A' ? 0x35d0ba : 0xff9a3d, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(s.x, 7, s.z);
    scene.add(beam);
    const lc = document.createElement('canvas');
    lc.width = lc.height = 128;
    const lg = lc.getContext('2d');
    lg.fillStyle = name === 'A' ? '#35d0ba' : '#ff9a3d';
    lg.font = 'bold 96px system-ui, sans-serif';
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.fillText(name, 64, 68);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lc), transparent: true, depthWrite: false }));
    sprite.scale.set(2.4, 2.4, 1);
    sprite.position.set(s.x, 3.4, s.z);
    scene.add(sprite);
    const light = new THREE.PointLight(name === 'A' ? 0x35d0ba : 0xff9a3d, 12, 14, 1.8);
    light.position.set(s.x, 2.5, s.z);
    scene.add(light);
    siteLights[name] = light;
  }

  // Dusk lighting: warm low sun + cool sky fill, soft shadows.
  scene.add(new THREE.HemisphereLight(0x8fa8c8, 0x8a6a48, 1.1)); // lifts shadowed faces
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(-18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); // 1024 keeps soft shadows on weak GPUs
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Dusk sky dome: indigo zenith -> rust horizon, a low sun glow in the
  // north-west, and faint stars overhead. A shader, not a texture, so the
  // sun sits exactly where the light comes from.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sunDir: { value: new THREE.Vector3(-0.55, 0.16, 0.42).normalize() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'varying vec3 vDir; uniform vec3 sunDir;',
      'float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }',
      'void main() {',
      '  float h = clamp(vDir.y, -0.08, 1.0);',
      '  vec3 col = mix(vec3(0.42, 0.22, 0.13), vec3(0.23, 0.15, 0.24), smoothstep(0.0, 0.22, h));',
      '  col = mix(col, vec3(0.07, 0.08, 0.17), smoothstep(0.18, 0.65, h));',
      '  float s = max(dot(normalize(vDir), sunDir), 0.0);',
      '  col += vec3(1.0, 0.55, 0.25) * pow(s, 90.0) * 1.2;',
      '  col += vec3(1.0, 0.45, 0.18) * pow(s, 6.0) * 0.35;',
      '  float cl = smoothstep(0.02, 0.06, h) * smoothstep(0.20, 0.10, h);',
      '  float band = 0.5 + 0.5 * sin(vDir.y * 90.0 + sin(vDir.x * 8.0) * 2.0);',
      '  col = mix(col, vec3(0.16, 0.10, 0.12), cl * smoothstep(0.6, 0.9, band) * 0.4);',
      '  float star = step(0.996, hash(floor(vDir * 120.0)));',
      '  col += vec3(0.8, 0.85, 1.0) * star * smoothstep(0.35, 0.7, h) * 0.7;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(150, 24, 16), skyMat));

  // Sun glow: a big additive halo sitting where the shader sun is, so
  // looking toward the north-west shows a low burning sun, not just a
  // bright patch of sky.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 256;
  {
    const g = glowCanvas.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 240, 210, 1)');
    grad.addColorStop(0.12, 'rgba(255, 200, 120, 0.9)');
    grad.addColorStop(0.4, 'rgba(255, 140, 60, 0.35)');
    grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCanvas), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunGlow.position.set(-0.55, 0.16, 0.42).normalize().multiplyScalar(130);
  sunGlow.scale.setScalar(70);
  scene.add(sunGlow);

  // Ground rubble: flat seeded rocks scattered over the sand — ground
  // detail you walk over, not blockers, so they carry no collider.
  {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b543a, roughness: 1 });
    let rs = 99;
    const rrand = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
    for (let i = 0; i < 16; i++) {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      const sc = 0.2 + rrand() * 0.45;
      rock.scale.set(sc, sc * 0.35, sc * (0.7 + rrand() * 0.6));
      rock.position.set(-28 + rrand() * 56, 0.05, -20 + rrand() * 40);
      rock.rotation.y = rrand() * Math.PI;
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }
  }

  // Distant dune silhouettes, fog-faded, for depth beyond the walls.
  const duneMat = new THREE.MeshBasicMaterial({ color: 0x9a7a55 });
  for (let i = 0; i < 7; i++) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(18 + i * 3, 8, 6), duneMat);
    const a = (i / 7) * Math.PI * 2;
    dune.position.set(Math.cos(a) * 70, -6, Math.sin(a) * 70);
    dune.scale.y = 0.22;
    scene.add(dune);
  }

  // --- collision + line of sight (3D AABB slab tests, no allocation) ---
  function collideCircle(p, r) {
    p.x = Math.max(-29.6 + r, Math.min(29.6 - r, p.x));
    p.z = Math.max(-21.6 + r, Math.min(21.6 - r, p.z));
    for (const c of colliders) {
      const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r;
        p.z = nz + (dz / d) * r;
      } else {
        // center inside the box: push out along the smallest penetration
        const pl = p.x - c.minX + r;
        const pr = c.maxX - p.x + r;
        const pt = p.z - c.minZ + r;
        const pb = c.maxZ - p.z + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = c.minX - r;
        else if (m === pr) p.x = c.maxX + r;
        else if (m === pt) p.z = c.minZ - r;
        else p.z = c.maxZ + r;
      }
    }
  }
  function segmentBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const c of colliders) {
      let t0 = 0;
      let t1 = 1;
      // X slab
      if (Math.abs(dx) < 1e-9) { if (ax < c.minX || ax > c.maxX) continue; }
      else {
        let u = (c.minX - ax) / dx;
        let v = (c.maxX - ax) / dx;
        if (u > v) { const t = u; u = v; v = t; }
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az < c.minZ || az > c.maxZ) continue; }
      else {
        let u = (c.minZ - az) / dz;
        let v = (c.maxZ - az) / dz;
        if (u > v) { const t = u; u = v; v = t; }
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
        if (t0 > t1) continue;
      }
      // Y slab: the box spans bottom..top (bottom is 0 unless stacked).
      if (Math.abs(dy) < 1e-9) { if (ay < c.bottom || ay > c.top) continue; }
      else {
        let u = (c.bottom - ay) / dy;
        let v = (c.top - ay) / dy;
        if (u > v) { const t = u; u = v; v = t; }
        t0 = Math.max(t0, u);
        t1 = Math.min(t1, v);
        if (t0 > t1) continue;
      }
      return true;
    }
    return false;
  }
  // BFS path over the waypoint graph; returns an array of {x, z} nodes.
  function findPath(fromName, toName) {
    if (fromName === toName) return [WAYPOINTS[toName]];
    const prev = { [fromName]: null };
    const queue = [fromName];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of WAYPOINTS[cur].links) {
        if (prev[next] !== undefined) continue;
        prev[next] = cur;
        if (next === toName) {
          const path = [];
          let n = next;
          while (n) { path.unshift(WAYPOINTS[n]); n = prev[n]; }
          return path;
        }
        queue.push(next);
      }
    }
    return [WAYPOINTS[toName]];
  }
  function nearestWaypoint(x, z) {
    let best = null;
    let bd = Infinity;
    for (const [name, w] of Object.entries(WAYPOINTS)) {
      const d = (w.x - x) ** 2 + (w.z - z) ** 2;
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }
  function inSite(x, z) {
    for (const [name, s] of Object.entries(SITES)) {
      if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) return name;
    }
    return null;
  }
  return { colliders, shootables, siteLights, collideCircle, segmentBlocked, findPath, nearestWaypoint, inSite };
}
