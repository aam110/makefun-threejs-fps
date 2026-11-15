// Shooting resolution: one hitscan path for the player and the bots. A shot
// is a ray against the world's meshes and the bots' hitboxes; the nearest hit
// wins. Damage falls with distance, headshots multiply, armor absorbs half.
// Grenades (HE + smoke) are projectiles stepped here.
import * as THREE from 'three';
import { ECON } from './state.js';

const HEAD_MULT = 4;
const ARMOR_ABSORB = 0.5;

export function createCombat(world, effects, audio) {
  const raycaster = new THREE.Raycaster();
  const dirV = new THREE.Vector3();
  const originV = new THREE.Vector3();
  const grenades = [];
  const smokes = []; // {x, y, z, r, until} — block bot line of sight
  let hitMeshes = []; // bot body/head meshes, refreshed by bots.js

  function setHitMeshes(list) { hitMeshes = list; }

  // Does a smoke cloud block the segment? (segment-sphere test, no allocation)
  function smokeBlocks(ax, ay, az, bx, by, bz, now) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    for (const s of smokes) {
      if (now > s.until) continue;
      let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.x;
      const py = ay + dy * t - s.y;
      const pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return true;
    }
    return false;
  }

  // weapon: the name of the gun that fired the killing shot (null for blasts),
  // carried on the kill event so the deathcam can name it.
  function damage(S, target, amount, part, attacker, weapon) {
    if (!target.alive) return;
    let hpDamage = amount;
    if (target.armor > 0) {
      const absorbed = amount * ARMOR_ABSORB;
      target.armor = Math.max(0, target.armor - absorbed);
      hpDamage = amount - absorbed;
    }
    target.hp -= hpDamage;
    S.events.push({ type: 'damage', target, amount: hpDamage, part, attacker });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deathTime = S.time;
      S.events.push({ type: 'kill', target, attacker, part, weapon: weapon || null });
      if (attacker && attacker.isPlayer) {
        S.money += ECON.killBonus;
        S.stats.kills += 1;
      }
      if (target.isPlayer) S.stats.deaths += 1;
    }
  }

  // shooter: combatant record; origin/dir: world-space; spread in radians;
  // def: the weapon definition of the gun being fired.
  function fireHitscan(S, shooter, origin, dir, spread, def) {
    const range = def ? def.range : 60;
    dirV.copy(dir);
    dirV.x += (S.rng() * 2 - 1) * spread;
    dirV.y += (S.rng() * 2 - 1) * spread;
    dirV.z += (S.rng() * 2 - 1) * spread;
    dirV.normalize();
    originV.copy(origin);
    raycaster.set(originV, dirV);
    raycaster.far = range;
    const targets = hitMeshes.length ? world.shootables.concat(hitMeshes) : world.shootables;
    const hits = raycaster.intersectObjects(targets, false);
    let end = null;
    let hitCombatant = null;
    let part = null;
    for (const h of hits) {
      const c = h.object.userData.combatant;
      if (c && c === shooter) continue; // never hit yourself
      if (c && c.team === shooter.team) continue; // no friendly fire: bullets pass through teammates
      if (c && !c.alive) continue; // corpses don't block bullets
      end = h.point;
      if (c) { hitCombatant = c; part = h.object.userData.part || 'body'; }
      break;
    }
    if (!end) {
      end = originV.clone().addScaledVector(dirV, range);
      effects.tracer(origin, end);
      return { hit: false };
    }
    effects.tracer(origin, end);
    if (hitCombatant) {
      const dist = originV.distanceTo(end);
      const falloff = dist > 25 ? 0.8 : 1;
      let dmg = (def ? def.damage : 30) * falloff;
      if (part === 'head') dmg *= HEAD_MULT;
      if (part === 'legs') dmg *= 0.75;
      if (shooter.isPlayer) { S.stats.hits += 1; audio.hit(part === 'head'); }
      damage(S, hitCombatant, dmg, part, shooter, def ? def.name : null);
      effects.blood(end);
      return { hit: true, target: hitCombatant, part, damage: dmg };
    }
    effects.impact(end);
    return { hit: false, wall: true };
  }

  function throwGrenade(S, shooter, from, dir, kind) {
    grenades.push({
      kind,
      pos: { x: from.x, y: from.y, z: from.z },
      vel: { x: dir.x * 13, y: dir.y * 13 + 3.5, z: dir.z * 13 },
      fuse: kind === 'he' ? 1.4 : 99,
      owner: shooter,
    });
    audio.throwPin();
  }

  function explode(S, g) {
    effects.explosion(g.pos);
    audio.explosion(0);
    S.events.push({ type: 'explosion', x: g.pos.x, z: g.pos.z });
    for (const c of S.combatants) {
      if (!c.alive) continue;
      if (g.owner && c.team === g.owner.team) continue; // no friendly fire
      const d = Math.hypot(c.pos.x - g.pos.x, c.pos.z - g.pos.z);
      if (d > 7) continue;
      // Walls shield: no damage through a solid.
      if (world.segmentBlocked(g.pos.x, 0.6, g.pos.z, c.pos.x, 1.2, c.pos.z)) continue;
      damage(S, c, 100 * (1 - d / 7) + 10, 'blast', null);
    }
  }

  function step(S, dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.vel.y -= 15 * dt;
      g.pos.x += g.vel.x * dt;
      g.pos.y += g.vel.y * dt;
      g.pos.z += g.vel.z * dt;
      g.fuse -= dt;
      if (g.pos.y <= 0.15) {
        g.pos.y = 0.15;
        if (g.kind === 'smoke') {
          smokes.push({ x: g.pos.x, y: 1.2, z: g.pos.z, r: 3.2, until: S.time + 15 });
          effects.smokeCloud(g.pos);
          audio.smokePop();
          grenades.splice(i, 1);
          continue;
        }
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        if (g.kind === 'he') explode(S, g);
        grenades.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      if (S.time > smokes[i].until) smokes.splice(i, 1);
    }
  }

  function clear() {
    grenades.length = 0;
    smokes.length = 0;
  }
  return { setHitMeshes, fireHitscan, throwGrenade, damage, smokeBlocks, step, clear, grenades, smokes };
}
