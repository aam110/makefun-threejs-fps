// The first-person gun: boxes and cylinders parented to the camera, one build
// per weapon (barrel length and accents differ), with walk bob, recoil kick,
// a reload dip and a muzzle flash. Pure presentation: no sim state here.
import * as THREE from 'three';

const GUN_STYLE = {
  pistol: { barrel: 0.22, body: 0.26, accent: 0x8a8f96 },
  smg: { barrel: 0.3, body: 0.42, accent: 0x35d0ba },
  rifle: { barrel: 0.5, body: 0.55, accent: 0xff9a3d },
  sniper: { barrel: 0.72, body: 0.6, accent: 0xc8cdd4 },
};
const HIP = { x: 0.24, y: -0.22, z: -0.45 };
const ADS = { x: 0, y: -0.155, z: -0.35 };

export function createViewmodel(camera) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.45, metalness: 0.7 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.9 });
  const group = new THREE.Group();
  const flashLight = new THREE.PointLight(0xffc266, 0, 9, 1.8);
  let accentMat = new THREE.MeshStandardMaterial({ color: 0xff9a3d, roughness: 0.4, metalness: 0.3 });
  let flashMesh = null;
  let flashLife = 0;
  let kick = 0;
  let reloadDip = 0;
  let aimBlend = 0;
  let current = null;

  function build(key) {
    while (group.children.length) group.remove(group.children[0]);
    const s = GUN_STYLE[key] || GUN_STYLE.rifle;
    accentMat = new THREE.MeshStandardMaterial({ color: s.accent, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, s.body), metal);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, s.barrel, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -s.body / 2 - s.barrel / 2 + 0.05);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.08), grip);
    mag.position.set(0, -0.11, 0.02);
    mag.rotation.x = 0.15;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.16), grip);
    stock.position.set(0, -0.01, s.body / 2 + 0.06);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.1), accentMat);
    sight.position.set(0, 0.085, -0.05);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.045, 0.015), metal);
    post.position.set(0, 0.075, -s.body / 2 - s.barrel + 0.08);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 8), grip);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.02, -s.body / 2 - s.barrel + 0.03);
    const parts = [body, barrel, mag, stock, sight, post, muzzle];
    if (key !== 'pistol') {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, s.barrel * 0.7), grip);
      guard.position.set(0, 0.01, -s.body / 2 - s.barrel * 0.3);
      parts.push(guard);
    }
    flashMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    flashMesh.rotation.x = -Math.PI / 2;
    flashMesh.position.set(0, 0.02, -s.body / 2 - s.barrel - 0.05);
    flashLight.position.copy(flashMesh.position);
    group.add(...parts, flashMesh, flashLight);
    group.position.set(HIP.x, HIP.y, HIP.z);
    current = key;
  }

  function setWeapon(key) {
    if (key !== current) build(key);
    group.visible = key !== null;
  }

  function onShot() {
    kick = 1;
    flashLife = 0.05;
    flashMesh.material.opacity = 0.95;
    flashLight.intensity = 8;
  }
  function onReload() { reloadDip = 1; }

  // dt render frame; bob from the player's walk phase; aiming 0..1.
  function update(dt, bobPhase, moveSpeed, aiming) {
    aimBlend += ((aiming ? 1 : 0) - aimBlend) * Math.min(1, 14 * dt);
    const x = HIP.x + (ADS.x - HIP.x) * aimBlend;
    const y = HIP.y + (ADS.y - HIP.y) * aimBlend + Math.sin(bobPhase * 2) * 0.006 * Math.min(1, moveSpeed / 4);
    const z = HIP.z + (ADS.z - HIP.z) * aimBlend + kick * 0.09;
    group.position.set(x + Math.cos(bobPhase) * 0.004 * Math.min(1, moveSpeed / 4), y, z);
    group.rotation.x = kick * 0.06 + reloadDip * 0.5;
    group.rotation.z = Math.sin(bobPhase) * 0.008 * Math.min(1, moveSpeed / 4);
    kick = Math.max(0, kick - dt * 7);
    reloadDip = Math.max(0, reloadDip - dt * 0.9);
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) {
        flashMesh.material.opacity = 0;
        flashLight.intensity = 0;
      }
    }
  }
  camera.add(group);
  return { setWeapon, onShot, onReload, update };
}
