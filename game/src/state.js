// The one state object: every module reads and writes this, nothing keeps a
// second copy of match truth. Rendering state (meshes, pools) lives in the
// modules that own it, never here.
import { mulberry32 } from './rng.js';

// Weapons: damage is per body hit at close range; headshots multiply by 4.
// spread is radians of cone at rest; moveBloom is added per m/s of speed;
// recoil is the pitch kick per shot in radians; auto weapons fire while held.
export const WEAPONS = {
  pistol: { name: 'P-9 Sidearm', slot: 'sidearm', price: 0, damage: 26, headMult: 4, rof: 0.18, auto: false, mag: 12, reserve: 48, reload: 1.6, spread: 0.006, moveBloom: 0.004, recoil: 0.014, range: 40, zoom: 0 },
  smg: { name: 'VK-9 Vector', slot: 'primary', price: 1200, damage: 24, headMult: 4, rof: 0.085, auto: true, mag: 30, reserve: 120, reload: 2.1, spread: 0.012, moveBloom: 0.006, recoil: 0.011, range: 35, zoom: 0 },
  rifle: { name: 'AR-7 Carbine', slot: 'primary', price: 2700, damage: 34, headMult: 4, rof: 0.11, auto: true, mag: 30, reserve: 90, reload: 2.4, spread: 0.008, moveBloom: 0.007, recoil: 0.016, range: 60, zoom: 0 },
  sniper: { name: 'LW-50 Longshot', slot: 'primary', price: 4750, damage: 110, headMult: 4, rof: 1.4, auto: false, mag: 5, reserve: 15, reload: 3.2, spread: 0.001, moveBloom: 0.02, recoil: 0.06, range: 90, zoom: 2.4 },
};
export const GEAR = {
  armor: { name: 'Kevlar Vest', price: 650 },
  he: { name: 'HE Grenade', price: 300 },
  smoke: { name: 'Smoke Grenade', price: 300 },
};
export const ECON = { startMoney: 800, killBonus: 300, winBonus: 3250, lossBonus: 1400, lossStreakStep: 500, lossBonusMax: 3400, plantBonus: 300 };
export const RULES = { roundsToWin: 5, maxRounds: 9, buyTime: 15, roundTime: 100, bombTime: 35, plantTime: 3.5, defuseTime: 5, endTime: 4.5 };

export function createState(seed) {
  return {
    rng: mulberry32(seed),
    seed,
    time: 0, // sim seconds since boot; the only clock the sim reads
    phase: 'menu', // menu | buy | live | planted | over | matchover
    phaseTime: 0, // seconds left in this phase
    round: 0,
    score: { atk: 0, def: 0 },
    lossStreak: 0,
    money: ECON.startMoney,
    combatants: [], // player + bots; see combatants.js shape in bots.js
    playerId: 0,
    bomb: { state: 'held', site: null, timer: 0, progress: 0, defuse: 0, x: 0, z: 0 },
    feed: [], // { text, t } kill feed lines, newest first
    events: [], // one-shot sim -> presentation events, drained each frame
    stats: { kills: 0, deaths: 0, shots: 0, hits: 0 },
    matchWinner: null,
    roundWinner: null,
    roundReason: '',
  };
}

// One place for phase changes, so the HUD, audio and bots all hear them.
export function setPhase(S, phase, seconds) {
  S.phase = phase;
  S.phaseTime = seconds;
  S.events.push({ type: 'phase', phase });
}
