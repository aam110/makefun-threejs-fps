// Bots: the other five combatants. Each has a role, a waypoint route, and a
// small state machine (route / hold / engage / investigate / retake / defuse).
// They see through the same LOS test the player is bound by, hear gunfire,
// and fire the same weapons with reaction time and honest spread.
import * as THREE from 'three';
import { SPAWNS } from './world.js';
import { makeLoadout, canFire, takeRound, startReload, stepWeapon } from './weapons.js';
import { range } from './rng.js';

const NAMES = { atk: ['Rook', 'Wren'], def: ['Vex', 'Havoc', 'Nomad'] };
const ROLES = {
  atk: [
    { role: 'rushA', route: ['atkSpawn', 'aLong1', 'aLong2', 'aLong3', 'aSite'], hold: 'aHold1' },
    { role: 'rushB', route: ['atkSpawn', 'bShort1', 'bShort2', 'bShort3', 'bSite'], hold: 'bHold1' },
  ],
  def: [
    { role: 'siteA', route: ['defSpawn', 'defA', 'aHold1'], hold: 'aHold1' },
    { role: 'siteB', route: ['defSpawn', 'defB', 'bHold1'], hold: 'bHold1' },
    { role: 'mid', route: ['defSpawn', 'defMid', 'midNorth'], hold: 'midNorth' },
  ],
};
const BOT_GUNS = { atk: ['rifle', 'smg'], def: ['rifle', 'rifle', 'smg'] };
const EYE = 1.5;
const WALK = 3.7;

export function createBots(scene, world, combat, audio) {
  const hitMeshes = [];
  const tmpDir = new THREE.Vector3();
  let bots = [];

  function buildMesh(team) {
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0x5a6b3f : 0x3f556b, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.8 });
    const accent = new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0xff9a3d : 0x35d0ba, roughness: 0.5 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), dark);
    head.position.y = 1.62;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.02), accent);
    visor.position.set(0, 1.64, -0.16);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), dark);
    legL.position.set(-0.14, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.7), dark);
    gun.position.set(0.2, 1.15, -0.35);
    g.add(torso, head, visor, legL, legR, gun);
    g.userData = { torso, head, legL, legR };
    return g;
  }

  function spawnRound(S) {
    for (const b of bots) scene.remove(b.mesh);
    hitMeshes.length = 0;
    bots = [];
    S.combatants = S.combatants.filter((c) => c.isPlayer);
    let id = 1;
    for (const team of ['atk', 'def']) {
      NAMES[team].forEach((name, i) => {
        const spawn = SPAWNS[team][i];
        const loadout = makeLoadout(BOT_GUNS[team][i]);
        const bot = {
          id: id++,
          name,
          team,
          isPlayer: false,
          pos: { x: spawn.x, y: 0, z: spawn.z },
          yaw: team === 'atk' ? Math.PI : 0,
          pitch: 0,
          hp: 100,
          armor: 0,
          alive: true,
          deathTime: 0,
          loadout,
          weapon: loadout.primary,
          speed: 0,
          bot: {
            role: ROLES[team][i].role,
            route: ROLES[team][i].route,
            hold: ROLES[team][i].hold,
            state: 'route',
            path: [],
            pathI: 0,
            target: null,
            lastSeen: 0,
            reactAt: 0,
            heardAt: -99,
            heardX: 0,
            heardZ: 0,
            burstLeft: 0,
            burstPause: 0,
            thinkAt: 0,
            scanDir: 1,
            strafeDir: 1,
            strafeAt: 0,
          },
          mesh: null,
        };
        bot.mesh = buildMesh(team);
        bot.mesh.position.set(bot.pos.x, 0, bot.pos.z);
        bot.mesh.rotation.y = bot.yaw;
        scene.add(bot.mesh);
        // Walk the role's route: chain BFS segments between consecutive
        // route nodes (some hops, e.g. defA -> aHold1, go via a third node).
        const route = ROLES[team][i].route;
        const pts = [];
        for (let j = 0; j < route.length - 1; j++) {
          for (const p of world.findPath(route[j], route[j + 1])) {
            if (!pts.length || pts[pts.length - 1] !== p) pts.push(p);
          }
        }
        bot.bot.path = pts;
        for (const [mesh, part] of [[bot.mesh.userData.torso, 'body'], [bot.mesh.userData.head, 'head'], [bot.mesh.userData.legL, 'legs'], [bot.mesh.userData.legR, 'legs']]) {
          mesh.userData.combatant = bot;
          mesh.userData.part = part;
          hitMeshes.push(mesh);
        }
        bots.push(bot);
        S.combatants.push(bot);
      });
    }
    combat.setHitMeshes(hitMeshes);
    return bots;
  }
  function eyeOf(c) { return { x: c.pos.x, y: c.pos.y + EYE, z: c.pos.z }; }

  function canSee(S, bot, enemy) {
    const dx = enemy.pos.x - bot.pos.x;
    const dz = enemy.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 48) return false;
    // Field of view: ~110 degrees ahead.
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.0) return false;
    const eye = eyeOf(bot);
    const chest = { x: enemy.pos.x, y: enemy.pos.y + 1.2, z: enemy.pos.z };
    if (world.segmentBlocked(eye.x, eye.y, eye.z, chest.x, chest.y, chest.z)) return false;
    if (combat.smokeBlocks(eye.x, eye.y, eye.z, chest.x, chest.y, chest.z, S.time)) return false;
    return true;
  }

  function routeTo(bot, nodeName, S) {
    const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
    bot.bot.path = world.findPath(from, nodeName);
    bot.bot.pathI = 0;
  }

  function think(S, bot) {
    const b = bot.bot;
    // Visible enemies first: nearest wins.
    let best = null;
    let bestD = Infinity;
    for (const c of S.combatants) {
      if (c.team === bot.team || !c.alive) continue;
      const d = Math.hypot(c.pos.x - bot.pos.x, c.pos.z - bot.pos.z);
      if (d < bestD && canSee(S, bot, c)) { best = c; bestD = d; }
    }
    if (best) {
      if (b.target !== best) {
        b.target = best;
        b.reactAt = S.time + range(S.rng, 0.35, 0.65);
        b.burstLeft = 0;
      }
      b.state = 'engage';
      b.lastSeen = S.time;
      return;
    }
    b.target = null;
    // Defenders retake a planted site; attackers guard the bomb.
    if (S.bomb.state === 'planted' && bot.team === 'def') {
      const site = S.bomb.site === 'A' ? 'aSite' : 'bSite';
      const d = Math.hypot(S.bomb.x - bot.pos.x, S.bomb.z - bot.pos.z);
      if (d < 2.2) { b.state = 'defuse'; return; }
      if (b.state !== 'retake') { routeTo(bot, site, S); b.state = 'retake'; }
      return;
    }
    // Investigate recent gunfire (only when it was an enemy's shot).
    if (S.time - b.heardAt < 3 && b.state !== 'investigate') {
      b.state = 'investigate';
      const near = world.nearestWaypoint(b.heardX, b.heardZ);
      routeTo(bot, near, S);
      return;
    }
    if (b.state === 'investigate' && S.time - b.heardAt >= 3) b.state = 'route';
    // Route following: walk the role's route, then hold. An empty path means
    // "not started yet", not "finished" — only a completed non-empty path
    // ends the route.
    if (b.state === 'route' || b.state === 'retake' || b.state === 'investigate') {
      if (b.path.length > 0 && b.pathI >= b.path.length) {
        if (b.state === 'route') b.state = 'hold';
        else if (b.state === 'investigate') { b.state = 'route'; routeTo(bot, b.hold, S); }
      }
      return;
    }
    if (b.state === 'hold') {
      // Hold position, scanning slowly; a fresh route order restarts movement.
      return;
    }
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    bot.pos.x += (dx / d) * step;
    bot.pos.z += (dz / d) * step;
    bot.speed = speed;
    world.collideCircle(bot.pos, 0.35);
    // Face the direction of travel.
    const want = Math.atan2(-dx, -dz);
    bot.yaw = turnToward(bot.yaw, want, 6 * dt);
    return d - step < 0.05;
  }
  function turnToward(yaw, want, maxStep) {
    let diff = want - yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return want;
    return yaw + Math.sign(diff) * maxStep;
  }

  function step(S, dt) {
    // Hearing: enemy gunfire within 30 m gives a position to investigate.
    for (const e of S.events) {
      if (e.type !== 'shot') continue;
      for (const bot of bots) {
        if (!bot.alive || bot.team === e.team) continue;
        const d = Math.hypot(e.x - bot.pos.x, e.z - bot.pos.z);
        if (d < 30) {
          bot.bot.heardAt = S.time;
          bot.bot.heardX = e.x;
          bot.bot.heardZ = e.z;
        }
      }
    }
    for (const bot of bots) {
      if (!bot.alive) continue;
      const b = bot.bot;
      stepWeapon(bot.loadout, dt);
      if (S.phase !== 'live' && S.phase !== 'planted') {
        bot.speed = 0;
        continue; // frozen during buy / round end
      }
      if (S.time >= b.thinkAt) {
        b.thinkAt = S.time + 0.12;
        think(S, bot);
      }
      if (b.state === 'route' || b.state === 'retake' || b.state === 'investigate') {
        if (b.path.length === 0) routeTo(bot, b.hold, S);
        // Retake ends at the bomb itself, not the site's center.
        if (b.state === 'retake' && b.pathI >= b.path.length) {
          moveToward(bot, S.bomb.x, S.bomb.z, dt, WALK);
        } else {
          const node = b.path[Math.min(b.pathI, b.path.length - 1)];
          if (node && moveToward(bot, node.x, node.z, dt, WALK)) b.pathI += 1;
        }
      } else if (b.state === 'hold') {
        bot.speed = 0;
        bot.yaw += b.scanDir * 0.35 * dt;
        if (S.rng() < dt * 0.3) b.scanDir *= -1;
      } else if (b.state === 'defuse') {
        bot.speed = 0;
      } else if (b.state === 'engage' && b.target && b.target.alive) {
        const t = b.target;
        const dx = t.pos.x - bot.pos.x;
        const dz = t.pos.z - bot.pos.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(-dx, -dz);
        bot.yaw = turnToward(bot.yaw, want, 4.5 * dt);
        // Strafe sideways while fighting, changing direction every second or so.
        if (S.time >= b.strafeAt) {
          b.strafeAt = S.time + range(S.rng, 0.7, 1.4);
          b.strafeDir *= -1;
        }
        const sx = Math.cos(bot.yaw) * b.strafeDir;
        const sz = -Math.sin(bot.yaw) * b.strafeDir;
        bot.pos.x += sx * 1.6 * dt;
        bot.pos.z += sz * 1.6 * dt;
        world.collideCircle(bot.pos, 0.35);
        bot.speed = 1.6;
        // Fire in bursts once reacted and roughly on target.
        let diff = want - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (S.time >= b.reactAt && Math.abs(diff) < 0.12) {
          if (b.burstLeft <= 0 && b.burstPause <= 0) {
            b.burstLeft = 3 + Math.floor(S.rng() * 3);
          }
          if (b.burstLeft > 0 && canFire(bot.loadout)) {
            takeRound(bot.loadout);
            b.burstLeft -= 1;
            const w = bot.weapon;
            const spread = w.def.spread * 2.2 + dist * 0.0006 + (t.speed || 0) * 0.004;
            const eye = eyeOf(bot);
            tmpDir.set(t.pos.x - eye.x, t.pos.y + 1.2 - eye.y, t.pos.z - eye.z).normalize();
            combat.fireHitscan(S, bot, eye, tmpDir, spread, w.def);
            audio.shot(w.key, dist, false);
            S.events.push({ type: 'shot', team: bot.team, x: bot.pos.x, z: bot.pos.z });
            if (b.burstLeft <= 0) b.burstPause = range(S.rng, 0.4, 0.9);
          } else if (bot.weapon.mag === 0) {
            startReload(bot.loadout);
          }
        }
        b.burstPause = Math.max(0, b.burstPause - dt);
        // Lost the target: after 2.5 s without sight, go back to the route.
        if (S.time - b.lastSeen > 2.5) {
          b.target = null;
          b.state = 'route';
          routeTo(bot, b.hold, S);
        }
      }
      // Separation: bots don't stack on each other.
      for (const other of S.combatants) {
        if (other === bot || !other.alive) continue;
        const dx = bot.pos.x - other.pos.x;
        const dz = bot.pos.z - other.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          bot.pos.x += (dx / d) * 0.5 * dt;
          bot.pos.z += (dz / d) * 0.5 * dt;
        }
      }
    }
  }

  // Render-side sync: mesh follows sim state; death tips the body over.
  function sync(S, dt) {
    for (const bot of bots) {
      const m = bot.mesh;
      m.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      m.rotation.y = bot.yaw;
      const u = m.userData;
      if (!bot.alive) {
        const t = Math.min(1, (S.time - bot.deathTime) * 3);
        m.rotation.x = -Math.PI / 2 * t;
        m.position.y = bot.pos.y - Math.max(0, (S.time - bot.deathTime - 4)) * 0.25;
        continue;
      }
      m.rotation.x = 0;
      const swing = bot.speed > 0.1 ? Math.sin(S.time * 9) * 0.5 : 0;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
    }
  }
  return { spawnRound, step, sync, bots: () => bots };
}
