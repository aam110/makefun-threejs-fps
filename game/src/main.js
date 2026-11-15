// Boot and the one loop: input -> fixed 60 Hz simulation -> render. The sim
// (rounds, player, bots, grenades) runs on a fixed step, apart from rendering;
// the frame only syncs cameras, meshes and the HUD from sim state.
// ?shot=start|play|buy|plant with &seed=N stages a deterministic frame for a
// screenshot, renders it twice, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { createState, RULES, setPhase } from './state.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createViewmodel } from './viewmodel.js';
import { createEffects } from './effects.js';
import { createDeathcam } from './deathcam.js';
import { makeLoadout, currentWeapon, canFire, takeRound, startReload, switchTo, stepWeapon } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const S = createState(seed);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in three 0.187
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x54301f); // matches the sky's horizon band
scene.fog = new THREE.Fog(0x54301f, 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const combat = createCombat(world, effects, audio);
const hud = createHud(world.colliders);
const playerCtl = createPlayer(world);
const viewmodel = createViewmodel(camera);
const deathcam = createDeathcam();
const bots = createBots(scene, world, combat, audio);

// The player combatant shares the controller's position object, so movement
// and combat always agree; yaw/pitch/speed sync each step.
const player = {
  id: 0, name: 'You', team: 'atk', isPlayer: true,
  pos: playerCtl.body.pos, yaw: Math.PI, pitch: 0,
  hp: 100, armor: 0, alive: true, deathTime: 0,
  loadout: makeLoadout(null), speed: 0,
};
S.combatants.push(player);
const rounds = createRounds(S, world, bots, combat, player, playerCtl);
const input = createInput(renderer.domElement, onLockChange);

const aimDir = new THREE.Vector3();
const eyePos = new THREE.Vector3();
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let shakeT = 0;
let fov = 74;
let beepAt = 0;
let matchShown = false;
let lastStepCycle = 0;

hud.setAmmo(12, 48, 'P-9 SIDEARM', false);
hud.setMoney(S.money);
hud.setScore(0, 0, 1, RULES.maxRounds);

hud.onPlay(() => {
  audio.unlock();
  if (S.phase === 'matchover' || (S.phase === 'menu' && started)) {
    rounds.startMatch();
  } else if (S.phase === 'menu') {
    rounds.startMatch();
  }
  started = true;
  hud.hideOverlay();
  input.requestLock();
});

// One buy path for both mouse clicks and number keys.
function doBuy(item) {
  if (S.phase !== 'buy') return;
  const res = rounds.buy(item);
  if (!res.ok) hud.feedLine(res.why, 'bad');
  hud.updateBuy(S.money, player.loadout);
  hud.setMoney(S.money);
}
hud.onBuy(doBuy);

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    if (hud.isBuyOpen()) hud.setBuyOpen(false);
  } else if (S.phase === 'live' || S.phase === 'planted') {
    if (player.alive) hud.showOverlay('paused');
  }
}

function syncCamera(dt = 0) {
  const b = playerCtl.body;
  camera.position.set(b.pos.x, b.pos.y + b.eye, b.pos.z);
  let px = b.pitch + b.recoilPitch;
  let yw = b.yaw + b.recoilYaw;
  if (shakeT > 0) {
    px += (Math.random() - 0.5) * 0.06 * shakeT;
    yw += (Math.random() - 0.5) * 0.06 * shakeT;
  }
  // Dead: the deathcam steers the view toward the killer instead of the
  // player's frozen aim. The camera stays where the body fell.
  if (!player.alive && deathcam.isActive()) {
    const dc = deathcam.update(dt, b.pos, b.eye);
    if (dc) { px = dc.pitch; yw = dc.yaw; }
  }
  camera.rotation.set(px, yw, 0, 'YXZ');
  const w = currentWeapon(player.loadout);
  const aiming = input.state.aiming && player.alive;
  const targetFov = aiming ? (w && w.key === 'sniper' ? 31 : 58) : 74;
  if (Math.abs(targetFov - fov) > 0.05) {
    fov += (targetFov - fov) * 0.2;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  hud.setScope(aiming && w && w.key === 'sniper');
}

function eyeAndDir() {
  const b = playerCtl.body;
  eyePos.set(b.pos.x, b.pos.y + b.eye, b.pos.z);
  camera.getWorldDirection(aimDir);
  return { eye: eyePos, dir: aimDir };
}

function playerShoot() {
  if (!player.alive || (S.phase !== 'live' && S.phase !== 'planted')) return;
  const loadout = player.loadout;
  if (loadout.current === 'he' || loadout.current === 'smoke') {
    if (input.state.firing && !prevFiring) {
      const kind = loadout.current;
      const { eye, dir } = eyeAndDir();
      combat.throwGrenade(S, player, eye, dir, kind);
      loadout[kind] -= 1;
      switchTo(loadout, loadout.last === 'he' || loadout.last === 'smoke' ? 'sidearm' : loadout.last);
      viewmodel.setWeapon(currentWeapon(loadout).key);
    }
    return;
  }
  const w = currentWeapon(loadout);
  if (!w) return;
  if (input.state.firing && !prevFiring && w.mag === 0 && w.reloading <= 0) audio.dry();
  if (!input.state.firing || !canFire(loadout)) return;
  if (!takeRound(loadout)) return;
  const { eye, dir } = eyeAndDir();
  const spread = playerCtl.spreadFor(w.def, input.state.aiming) + w.bloom;
  S.stats.shots += 1;
  combat.fireHitscan(S, player, eye, dir, spread, w.def);
  playerCtl.addRecoil(w.def.recoil, (S.rng() * 2 - 1) * w.def.recoil * 0.4);
  viewmodel.onShot();
  audio.shot(w.key, 0, true);
  S.events.push({ type: 'shot', team: 'atk', x: player.pos.x, z: player.pos.z });
}

const BUY_KEYS = { slot1: 'smg', slot2: 'rifle', slot3: 'sniper', he: 'armor', smoke: 'he', slot6: 'smoke' };

function handleActions() {
  for (const a of input.drainActions()) {
    if (a === 'buy') {
      if (S.phase === 'buy') {
        if (hud.isBuyOpen()) {
          hud.setBuyOpen(false);
          input.requestLock();
        } else {
          hud.setBuyOpen(true);
          hud.updateBuy(S.money, player.loadout);
          input.releaseLock();
        }
      }
      continue;
    }
    if (hud.isBuyOpen()) {
      const item = BUY_KEYS[a];
      if (item) doBuy(item);
      continue;
    }
    if (!player.alive) continue;
    if (a === 'reload') {
      if (startReload(player.loadout)) {
        audio.reload();
        viewmodel.onReload();
      }
    } else if (a === 'slot1' || a === 'slot2') {
      const slot = a === 'slot1' ? 'primary' : 'sidearm';
      if (switchTo(player.loadout, slot)) viewmodel.setWeapon(currentWeapon(player.loadout).key);
    } else if (a === 'he' || a === 'smoke') {
      if (switchTo(player.loadout, a)) viewmodel.setWeapon(null);
    } else if (a === 'lastweapon') {
      const last = player.loadout.last;
      if ((last === 'primary' || last === 'sidearm') && switchTo(player.loadout, last)) {
        viewmodel.setWeapon(currentWeapon(player.loadout).key);
      }
    }
  }
}

function drainEvents() {
  for (const e of S.events) {
    if (e.type === 'damage' && e.target.isPlayer) {
      const dx = e.attacker ? e.attacker.pos.x - player.pos.x : 0;
      const dz = e.attacker ? e.attacker.pos.z - player.pos.z : 0;
      const ang = e.attacker ? Math.atan2(-dx, -dz) - playerCtl.body.yaw : null;
      hud.damageFlash(ang);
    } else if (e.type === 'damage' && e.attacker && e.attacker.isPlayer) {
      hud.hitmarker(e.part === 'head');
    } else if (e.type === 'kill') {
      const head = e.part === 'head' ? ' ☠' : '';
      const who = e.attacker ? e.attacker.name : '💥';
      hud.feedLine(`${who} ▸ ${e.target.name}${head}`, e.attacker && e.attacker.isPlayer ? 'good' : e.target.isPlayer ? 'bad' : '');
      if (e.attacker && e.attacker.isPlayer) audio.kill();
      if (e.target.isPlayer) {
        hud.setHint('You are out — spectating your team.');
        // Deathcam: the camera eases round to face the killer, and the card
        // names them and the weapon — a death that teaches you something.
        deathcam.begin(e.attacker || null, playerCtl.body.yaw, playerCtl.body.pitch);
        hud.showDeathCard(
          e.attacker ? e.attacker.name : 'THE BLAST',
          e.weapon || (e.attacker ? 'Unknown weapon' : 'HE blast'),
        );
      }
    } else if (e.type === 'round') {
      deathcam.reset();
      hud.hideDeathCard();
      hud.banner(`ROUND ${e.round}`, e.round === 1 ? 'Plant the charge at A or B' : '', 2200);
    } else if (e.type === 'live') {
      if (hud.isBuyOpen()) {
        hud.setBuyOpen(false);
        hud.showOverlay('paused');
      }
    } else if (e.type === 'planted') {
      hud.banner('CHARGE PLANTED', `Site ${e.site} — defend it`, 2600);
      audio.plant();
    } else if (e.type === 'roundEnd') {
      const won = e.winner === 'atk';
      hud.banner(won ? 'ROUND WON' : 'ROUND LOST', e.reason, 3200);
      if (won) audio.roundWin();
      else audio.roundLose();
    } else if (e.type === 'bought') {
      audio.buy();
      hud.feedLine(`Bought ${e.name}`, 'good');
    } else if (e.type === 'explosion' && e.big) {
      effects.explosion({ x: e.x, y: 0.5, z: e.z });
      const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
      audio.explosion(d);
      shakeT = 0.8;
    } else if (e.type === 'matchPending') {
      // The 'over' phase ends in the match screen; nothing to do yet.
    }
  }
  S.events.length = 0;
}

function updateHud() {
  const w = currentWeapon(player.loadout);
  hud.setHealth(player.hp, player.armor);
  hud.setAmmo(w ? w.mag : 0, w ? w.reserve : 0, w ? w.def.name.toUpperCase() : player.loadout.current === 'he' ? 'HE GRENADE' : 'SMOKE GRENADE', w ? w.reloading > 0 : false);
  hud.setMoney(S.money);
  hud.setScore(S.score.atk, S.score.def, S.round, RULES.maxRounds);
  hud.setTeam(S.combatants);
  const label = S.phase === 'buy' ? 'BUY' : S.phase === 'live' ? 'ROUND' : S.phase === 'planted' ? 'BOMB' : S.phase === 'over' ? 'NEXT ROUND' : 'DUSTLINE';
  hud.setTimer(S.phaseTime, label, (S.phase === 'live' || S.phase === 'planted') && S.phaseTime < 10);
  const spread = w ? (playerCtl.spreadFor(w.def, input.state.aiming) + w.bloom) * 900 : 6;
  hud.setCrosshair(Math.min(30, spread));
  if (S.bomb.progress > 0 && S.phase === 'live') hud.setProgress(S.bomb.progress, 'PLANTING THE CHARGE');
  else if (S.bomb.defuse > 0 && S.phase === 'planted') hud.setProgress(S.bomb.defuse, 'ENEMY DEFUSING');
  else hud.setProgress(null);
  if (!player.alive) hud.setHint('You are out — spectating your team.');
  else if (hud.isBuyOpen()) hud.setHint('Click an item or press 1–6 to buy · B to close');
  else if (S.phase === 'buy') hud.setHint('Press B to open the buy menu');
  else if (S.phase === 'live' && S.bomb.state === 'held' && world.inSite(player.pos.x, player.pos.z)) hud.setHint('Hold E to plant the charge');
  else if (S.phase === 'planted') hud.setHint(`Charge planted at ${S.bomb.site} — defend it!`);
  else hud.setHint('');
  hud.drawMinimap(S, player);
  // Bomb beeping, faster as the timer runs out.
  if (S.phase === 'planted' && S.time >= beepAt) {
    beepAt = S.time + (S.bomb.timer < 10 ? 0.5 : 1);
    audio.beep(S.bomb.timer < 10);
  }
  // A dead player holds no gun: hide the viewmodel until the next round.
  viewmodel.setWeapon(player.alive && w ? w.key : null);
}

function step(dt) {
  S.time += dt;
  const playing = S.phase === 'live' || S.phase === 'planted' || S.phase === 'buy';
  if (playing && player.alive) {
    playerCtl.step(dt, input.state.keys, input.state.aiming);
    player.yaw = playerCtl.body.yaw;
    player.pitch = playerCtl.body.pitch;
    player.speed = playerCtl.body.moveSpeed;
  } else {
    player.speed = 0;
  }
  stepWeapon(player.loadout, dt);
  bots.step(S, dt);
  rounds.step(S, dt, input.state);
  combat.step(S, dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  // Clamp to 0.25 s (15 fixed steps): the game keeps full speed down to
  // ~4 fps on slow machines instead of running in slow motion, and the
  // step cap prevents a spiral of death after a long hitch.
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive && input.state.locked) playerCtl.look(look.x, look.y);
    playerShoot();
    prevFiring = input.state.firing;
    handleActions();
    accumulator += dt;
    let n = 0;
    while (accumulator >= FIXED_STEP && n < 15) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      n += 1;
    }
    if (accumulator > FIXED_STEP * 15) accumulator = 0;
    if (S.phase === 'matchover' && !matchShown) {
      matchShown = true;
      hud.showOverlay('end', {
        winner: S.matchWinner,
        atk: S.score.atk,
        def: S.score.def,
        kills: S.stats.kills,
        deaths: S.stats.deaths,
        acc: S.stats.shots ? Math.round((100 * S.stats.hits) / S.stats.shots) : 0,
      });
      input.releaseLock();
    }
    syncCamera(dt);
    shakeT = Math.max(0, shakeT - dt);
    bots.sync(S, dt);
    effects.step(dt);
    viewmodel.update(dt, playerCtl.body.bobPhase, playerCtl.body.moveSpeed, input.state.aiming && player.alive);
    // Footsteps: one soft step per half bob cycle while moving on the ground.
    const cycle = Math.floor(playerCtl.body.bobPhase / Math.PI);
    if (cycle !== lastStepCycle) {
      lastStepCycle = cycle;
      if (player.alive && playerCtl.body.grounded && playerCtl.body.moveSpeed > 1) audio.step();
    }
    updateHud();
    drainEvents();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i++) step(FIXED_STEP);
}
function aimAt(x, y, z) {
  const b = playerCtl.body;
  const dx = x - b.pos.x;
  const dy = y - (b.pos.y + b.eye);
  const dz = z - b.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  b.yaw = Math.atan2(-dx, -dz);
  b.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  player.yaw = b.yaw;
  player.pitch = b.pitch;
  syncCamera();
}
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    bots.sync(S, 0);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    playerCtl.body.pos.x = 0.6;
    playerCtl.body.pos.z = 14;
    settle(20);
    // Frame the yard with the site-A beam and containers in view, so the
    // menu shot reads as a place, not an empty lane.
    aimAt(-7, 2.4, -11);
    hud.showOverlay('start');
    updateHud();
  } else if (name === 'buy') {
    rounds.startMatch();
    settle(30);
    playerCtl.body.pos.x = 0;
    playerCtl.body.pos.z = 16;
    aimAt(0, 1.6, -6);
    hud.setBuyOpen(true);
    hud.updateBuy(S.money, player.loadout);
    updateHud();
  } else if (name === 'plant') {
    rounds.startMatch();
    // Skip the buy phase: jump straight into the round.
    setPhase(S, 'live', RULES.roundTime);
    settle(30);
    playerCtl.body.pos.x = -18.5;
    playerCtl.body.pos.z = -9;
    S.bomb.progress = 0.62;
    aimAt(-20, 3.2, -12); // the floating site-A letter, ring and container in frame
    settle(2);
    updateHud();
  } else {
    // play: a live round, a few seconds in, aiming at the nearest enemy bot.
    rounds.startMatch();
    setPhase(S, 'live', RULES.roundTime);
    settle(60 * 4);
    playerCtl.body.pos.x = 0;
    playerCtl.body.pos.z = 8;
    let foe = null;
    let bd = Infinity;
    for (const c of S.combatants) {
      if (c.team !== 'def' || !c.alive) continue;
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      if (d < bd) { bd = d; foe = c; }
    }
    if (foe) aimAt(foe.pos.x, 1.3, foe.pos.z);
    else aimAt(0, 1.5, -6);
    // Fire one real shot at the target before freezing: the tracer and the
    // muzzle flash are in the frame, and the shot is honest — the same
    // fireHitscan path the player uses, with the same spread. Shot mode
    // never runs frame(), so updateHud hasn't built the viewmodel yet:
    // build it first, or onShot touches a null flash. Skip the shot if a
    // bot dropped the player during the settle — the frame still reads.
    if (foe && player.alive) {
      const w = currentWeapon(player.loadout);
      viewmodel.setWeapon(w.key);
      const { eye, dir } = eyeAndDir();
      const spread = playerCtl.spreadFor(w.def, false) + w.bloom;
      combat.fireHitscan(S, player, eye, dir, spread, w.def);
      viewmodel.onShot();
      takeRound(player.loadout);
    }
    updateHud();
  }
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
