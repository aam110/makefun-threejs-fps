// Rounds, match, economy and the objective. One round: buy (15 s) -> live
// (100 s) -> planted (35 s bomb) or over. First to 5 rounds takes the match.
// The player carries the charge: plant it at A or B, or wipe the defenders.
import { ECON, RULES, WEAPONS, GEAR, setPhase } from './state.js';
import { makeLoadout, makeWeapon } from './weapons.js';

export function createRounds(S, world, bots, combat, player, playerBody) {
  function resetPlayer() {
    player.hp = 100;
    player.alive = true;
    player.deathTime = 0;
    player.pos.x = 0;
    player.pos.y = 0;
    player.pos.z = 20;
    player.yaw = Math.PI;
    player.pitch = 0;
    playerBody.body.pos.x = 0;
    playerBody.body.pos.y = 0;
    playerBody.body.pos.z = 20;
    playerBody.body.yaw = Math.PI;
    playerBody.body.pitch = 0;
    playerBody.body.vel.x = 0;
    playerBody.body.vel.y = 0;
    playerBody.body.vel.z = 0;
    playerBody.body.recoilPitch = 0;
    playerBody.body.recoilYaw = 0;
  }

  function startMatch() {
    S.score.atk = 0;
    S.score.def = 0;
    S.lossStreak = 0;
    S.money = ECON.startMoney;
    S.round = 0;
    S.stats.kills = 0;
    S.stats.deaths = 0;
    S.stats.shots = 0;
    S.stats.hits = 0;
    S.matchWinner = null;
    player.loadout = makeLoadout(null);
    player.armor = 0;
    startRound();
  }

  function startRound() {
    S.round += 1;
    S.bomb = { state: 'held', site: null, timer: 0, progress: 0, defuse: 0, x: 0, z: 0 };
    S.feed.length = 0;
    combat.clear();
    resetPlayer();
    bots.spawnRound(S);
    setPhase(S, 'buy', RULES.buyTime);
    S.events.push({ type: 'round', round: S.round });
  }

  function endRound(winner, reason) {
    if (S.phase === 'over' || S.phase === 'matchover') return;
    S.roundWinner = winner;
    S.roundReason = reason;
    S.score[winner] += 1;
    if (winner === 'atk') {
      S.money += ECON.winBonus;
      S.lossStreak = 0;
    } else {
      S.money += Math.min(ECON.lossBonusMax, ECON.lossBonus + S.lossStreak * ECON.lossStreakStep);
      S.lossStreak += 1;
    }
    S.events.push({ type: 'roundEnd', winner, reason });
    const matchOver = S.score.atk >= RULES.roundsToWin || S.score.def >= RULES.roundsToWin || S.round >= RULES.maxRounds;
    if (matchOver) {
      S.matchWinner = S.score.atk > S.score.def ? 'atk' : S.score.def > S.score.atk ? 'def' : 'draw';
      setPhase(S, 'over', RULES.endTime);
      S.events.push({ type: 'matchPending' });
    } else {
      setPhase(S, 'over', RULES.endTime);
    }
  }

  function buy(item) {
    if (S.phase !== 'buy') return { ok: false, why: 'Buy only between rounds' };
    const def = WEAPONS[item] || GEAR[item];
    if (!def) return { ok: false, why: 'No such item' };
    if (S.money < def.price) return { ok: false, why: 'Not enough money' };
    if (WEAPONS[item]) {
      if (item === 'pistol') return { ok: false, why: 'Already carried' };
      player.loadout.primary = makeWeapon(item);
      player.loadout.current = 'primary';
    } else if (item === 'armor') {
      if (player.armor >= 100) return { ok: false, why: 'Armor full' };
      player.armor = 100;
    } else if (item === 'he') {
      if (player.loadout.he >= 2) return { ok: false, why: 'Max 2 HE' };
      player.loadout.he += 1;
    } else if (item === 'smoke') {
      if (player.loadout.smoke >= 2) return { ok: false, why: 'Max 2 smoke' };
      player.loadout.smoke += 1;
    }
    S.money -= def.price;
    S.events.push({ type: 'bought', item, name: def.name });
    return { ok: true };
  }

  function step(S, dt, inputState) {
    if (S.phase === 'buy' || S.phase === 'live' || S.phase === 'planted' || S.phase === 'over') {
      S.phaseTime -= dt;
    }
    if (S.phase === 'buy' && S.phaseTime <= 0) {
      setPhase(S, 'live', RULES.roundTime);
      S.events.push({ type: 'live' });
    }
    if (S.phase === 'live') {
      // Plant: hold E inside a site while alive and carrying the charge.
      const site = player.alive && S.bomb.state === 'held' ? world.inSite(player.pos.x, player.pos.z) : null;
      if (site && inputState.keys.has('KeyE')) {
        S.bomb.progress += dt / RULES.plantTime;
        if (S.bomb.progress >= 1) {
          S.bomb.state = 'planted';
          S.bomb.site = site;
          S.bomb.x = player.pos.x;
          S.bomb.z = player.pos.z;
          S.bomb.timer = RULES.bombTime;
          S.money += ECON.plantBonus;
          setPhase(S, 'planted', RULES.bombTime);
          S.events.push({ type: 'planted', site });
        }
      } else {
        S.bomb.progress = Math.max(0, S.bomb.progress - dt / RULES.plantTime);
      }
      if (S.phaseTime <= 0) endRound('def', 'Time expired');
    }
    if (S.phase === 'planted') {
      S.bomb.timer -= dt;
      // A defender standing at the bomb defuses it (5 s, progress kept).
      const defusing = S.combatants.some((c) => !c.isPlayer && c.team === 'def' && c.alive && c.bot && c.bot.state === 'defuse');
      if (defusing) {
        S.bomb.defuse += dt / RULES.defuseTime;
        if (S.bomb.defuse >= 1) {
          S.bomb.state = 'defused';
          endRound('def', 'Charge defused');
        }
      }
      if (S.phase === 'planted' && S.bomb.timer <= 0) {
        S.bomb.state = 'exploded';
        S.events.push({ type: 'explosion', x: S.bomb.x, z: S.bomb.z, big: true });
        endRound('atk', 'Charge detonated');
      }
    }
    if (S.phase === 'live' || S.phase === 'planted') {
      const atkAlive = S.combatants.filter((c) => c.team === 'atk' && c.alive).length;
      const defAlive = S.combatants.filter((c) => c.team === 'def' && c.alive).length;
      if (defAlive === 0) endRound('atk', 'Team eliminated');
      else if (atkAlive === 0 && S.phase === 'live') endRound('def', 'Team eliminated');
      // All attackers dead after the plant: defenders must still defuse.
    }
    if (S.phase === 'over' && S.phaseTime <= 0) {
      if (S.matchWinner) setPhase(S, 'matchover', 0);
      else startRound();
    }
    // The carrier died: the charge is lost for this round.
    if (!player.alive && S.bomb.state === 'held') S.bomb.state = 'lost';
  }

  return { startMatch, startRound, endRound, buy, step };
}
