// Weapon instances: one per combatant per slot. Firing, reload and swap are
// pure state transitions on the instance; combat.js resolves what a shot hits.
// Bots use the same instances, so their fire rates and reloads are honest.
import { WEAPONS } from './state.js';

export function makeWeapon(key) {
  const def = WEAPONS[key];
  return { key, def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0, bloom: 0 };
}

export function makeLoadout(primaryKey) {
  return {
    primary: primaryKey ? makeWeapon(primaryKey) : null,
    sidearm: makeWeapon('pistol'),
    he: 0,
    smoke: 0,
    current: primaryKey ? 'primary' : 'sidearm', // or 'he' | 'smoke' while throwing
    last: 'sidearm',
    swapTimer: 0,
  };
}

export function currentWeapon(loadout) {
  if (loadout.current === 'he' || loadout.current === 'smoke') return null;
  return loadout[loadout.current];
}

// Can this weapon fire right now? (loaded, cooled down, not reloading/swapping)
export function canFire(loadout) {
  const w = currentWeapon(loadout);
  return w !== null && w.mag > 0 && w.cooldown <= 0 && w.reloading <= 0 && loadout.swapTimer <= 0;
}

// Spend one round; returns false when the magazine is empty (dry fire).
export function takeRound(loadout) {
  const w = currentWeapon(loadout);
  if (!w || w.mag <= 0) return false;
  w.mag -= 1;
  w.cooldown = w.def.rof;
  w.bloom = Math.min(0.02, w.bloom + w.def.recoil * 0.35);
  return true;
}

export function startReload(loadout) {
  const w = currentWeapon(loadout);
  if (!w || w.reloading > 0 || w.mag >= w.def.mag || w.reserve <= 0) return false;
  w.reloading = w.def.reload;
  return true;
}

export function switchTo(loadout, slot) {
  if (loadout.current === slot || loadout.swapTimer > 0) return false;
  if (slot === 'primary' && !loadout.primary) return false;
  if (slot === 'he' && loadout.he <= 0) return false;
  if (slot === 'smoke' && loadout.smoke <= 0) return false;
  const w = currentWeapon(loadout);
  if (w) w.reloading = 0; // swapping cancels a reload
  loadout.last = loadout.current === 'he' || loadout.current === 'smoke' ? loadout.last : loadout.current;
  loadout.current = slot;
  loadout.swapTimer = 0.35;
  return true;
}

export function stepWeapon(loadout, dt) {
  for (const slot of ['primary', 'sidearm']) {
    const w = loadout[slot];
    if (!w) continue;
    w.cooldown = Math.max(0, w.cooldown - dt);
    w.bloom = Math.max(0, w.bloom - dt * 0.03);
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        const take = Math.min(w.def.mag - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    }
  }
  loadout.swapTimer = Math.max(0, loadout.swapTimer - dt);
}
