// HUD: every DOM readout, the minimap, the buy menu and the overlays. The sim
// never touches the DOM; main.js calls these setters from the event drain and
// once per frame for the live numbers.
import { WEAPONS, GEAR } from './state.js';

const $ = (id) => document.getElementById(id);

export function createHud(colliders) {
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthFill: $('health-fill'),
    healthNum: $('health-num'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    reloadHint: $('reload-hint'),
    money: $('money'),
    timer: $('timer'),
    timerLabel: $('timer-label'),
    scoreAtk: $('score-atk'),
    scoreDef: $('score-def'),
    roundNum: $('round-num'),
    teamAtk: $('team-atk'),
    teamDef: $('team-def'),
    feed: $('feed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buy: $('buy'),
    buyItems: [...document.querySelectorAll('#buy [data-item]')],
    progress: $('progress'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    vignette: $('vignette'),
    damageDir: $('damage-dir'),
    scope: $('scope'),
    hint: $('hint'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play'),
    map: $('minimap'),
  };
  // Minimap static layer: walls + sites, drawn once to an offscreen canvas.
  const mapCtx = el.map.getContext('2d');
  const MW = el.map.width;
  const MH = el.map.height;
  const sx = (x) => ((x + 31) / 62) * MW;
  const sz = (z) => ((z + 23) / 46) * MH;
  const staticMap = document.createElement('canvas');
  staticMap.width = MW;
  staticMap.height = MH;
  {
    const g = staticMap.getContext('2d');
    g.fillStyle = 'rgba(20,22,26,0.85)';
    g.fillRect(0, 0, MW, MH);
    g.fillStyle = '#8a7f70';
    for (const c of colliders) g.fillRect(sx(c.minX), sz(c.minZ), sx(c.maxX) - sx(c.minX), sz(c.maxZ) - sz(c.minZ));
    g.font = 'bold 13px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#35d0ba';
    g.fillText('A', sx(-20), sz(-12));
    g.fillStyle = '#ff9a3d';
    g.fillText('B', sx(20), sz(-12));
  }
  let playCb = null;
  let buyCb = null;
  let hitTimer = null;
  let bannerTimer = null;
  let lastTeamSig = '';
  el.playBtn.addEventListener('click', () => playCb && playCb());
  for (const item of el.buyItems) {
    item.addEventListener('click', () => buyCb && buyCb(item.dataset.item));
  }
  const fmtMoney = (n) => '$' + n.toLocaleString('en-US');
  const fmtTime = (s) => {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  return {
    onPlay(cb) { playCb = cb; },
    onBuy(cb) { buyCb = cb; },
    setHealth(hp, armor) {
      el.healthNum.textContent = Math.ceil(hp);
      el.healthFill.style.width = `${Math.max(0, hp)}%`;
      el.healthFill.classList.toggle('low', hp <= 30);
      el.armorNum.textContent = armor > 0 ? `🛡 ${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve, name, reloading) {
      el.ammoMag.textContent = mag;
      el.ammoReserve.textContent = `/ ${reserve}`;
      el.weaponName.textContent = name;
      el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
      el.reloadHint.textContent = reloading ? 'RELOADING…' : mag === 0 ? 'R — RELOAD' : '';
    },
    setMoney(m) { el.money.textContent = fmtMoney(m); },
    setTimer(seconds, label, urgent) {
      el.timer.textContent = fmtTime(seconds);
      el.timerLabel.textContent = label;
      el.timer.classList.toggle('urgent', !!urgent);
    },
    setScore(atk, def, round, max) {
      el.scoreAtk.textContent = atk;
      el.scoreDef.textContent = def;
      el.roundNum.textContent = `ROUND ${Math.max(1, round)}/${max}`;
    },
    setTeam(combatants) {
      // Rebuild only when the alive set changes — updateHud calls this every
      // frame, and rebuilding the DOM + strings each frame is pure churn.
      const sig = combatants.map((c) => `${c.team[0]}${c.alive ? 1 : 0}`).join('');
      if (sig === lastTeamSig) return;
      lastTeamSig = sig;
      for (const team of ['atk', 'def']) {
        const box = team === 'atk' ? el.teamAtk : el.teamDef;
        const list = combatants.filter((c) => c.team === team);
        box.innerHTML = list.map((c) => `<span class="pip ${c.alive ? 'alive' : 'dead'}" title="${c.name}">${c.isPlayer ? 'YOU' : c.name.slice(0, 2).toUpperCase()}</span>`).join('');
      }
    },
    feedLine(text, cls) {
      const div = document.createElement('div');
      div.className = `feed-line ${cls || ''}`;
      div.textContent = text;
      el.feed.prepend(div);
      while (el.feed.children.length > 5) el.feed.removeChild(el.feed.lastChild);
      setTimeout(() => div.remove(), 6000);
    },
    banner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { el.banner.hidden = true; }, ms);
    },
    hideBanner() { el.banner.hidden = true; },
    hitmarker(kill) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', !!kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), 120);
    },
    damageFlash(angle) {
      el.vignette.classList.add('on');
      setTimeout(() => el.vignette.classList.remove('on'), 220);
      if (angle !== null && angle !== undefined) {
        el.damageDir.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        el.damageDir.classList.add('on');
        setTimeout(() => el.damageDir.classList.remove('on'), 450);
      }
    },
    setCrosshair(spreadPx) {
      el.crosshair.style.setProperty('--gap', `${Math.round(3 + spreadPx)}px`);
    },
    setScope(on) { el.scope.hidden = !on; },
    setHint(text) { el.hint.textContent = text || ''; },
    setProgress(frac, label) {
      if (frac === null) {
        el.progress.hidden = true;
        return;
      }
      el.progress.hidden = false;
      el.progressFill.style.width = `${Math.round(frac * 100)}%`;
      el.progressLabel.textContent = label;
    },
    showOverlay(mode, score) {
      el.overlay.hidden = false;
      if (mode === 'start') {
        el.overlayTitle.textContent = 'DUSTLINE';
        el.overlayCopy.textContent = 'Yard 9, dusk. Plant the charge at A or B — or wipe the Sentinels. First to 5 rounds takes the match.';
        el.playBtn.textContent = 'Click to play';
      } else if (mode === 'paused') {
        el.overlayTitle.textContent = 'Paused';
        el.overlayCopy.textContent = 'Click to resume the round.';
        el.playBtn.textContent = 'Resume';
      } else if (mode === 'end') {
        el.overlayTitle.textContent = score.winner === 'atk' ? 'VANGUARD WINS' : score.winner === 'def' ? 'SENTINELS WIN' : 'DRAW';
        el.overlayCopy.textContent = `Final score ${score.atk} — ${score.def}. Kills ${score.kills} · Deaths ${score.deaths} · Accuracy ${score.acc}%`;
        el.playBtn.textContent = 'Play again';
      }
    },
    hideOverlay() { el.overlay.hidden = true; },
    setBuyOpen(open) { el.buy.hidden = !open; },
    isBuyOpen() { return !el.buy.hidden; },
    updateBuy(money, loadout) {
      for (const item of el.buyItems) {
        const key = item.dataset.item;
        const def = WEAPONS[key] || GEAR[key];
        const owned = key === 'armor' ? false : key === 'he' ? loadout.he >= 2 : key === 'smoke' ? loadout.smoke >= 2 : false;
        item.classList.toggle('cant', money < def.price || owned);
        item.querySelector('.price').textContent = fmtMoney(def.price);
      }
    },
    drawMinimap(S, player) {
      mapCtx.drawImage(staticMap, 0, 0);
      for (const c of S.combatants) {
        if (!c.alive) continue;
        if (c.team !== 'atk' && !c.isPlayer) continue; // enemies stay hidden
        mapCtx.fillStyle = c.isPlayer ? '#ffffff' : '#7dd069';
        mapCtx.beginPath();
        mapCtx.arc(sx(c.pos.x), sz(c.pos.z), c.isPlayer ? 4 : 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      if (S.bomb.state === 'planted') {
        mapCtx.fillStyle = '#ff4444';
        mapCtx.beginPath();
        mapCtx.arc(sx(S.bomb.x), sz(S.bomb.z), 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
    },
  };
}
