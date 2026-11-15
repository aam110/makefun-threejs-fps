// Input: keyboard state, pointer-lock mouse look, and edge-triggered actions.
// The sim reads input.state each fixed step; nothing else touches the DOM.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    lookX: 0, // accumulated mouse dx since last takeLook, pixels
    lookY: 0,
    firing: false, // left button held
    aiming: false, // right button held
    locked: false,
    actions: [], // edge actions drained once per step: 'reload','buy','slot1..','he','smoke','lastweapon'
  };
  const SLOT_KEYS = { Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'he', Digit5: 'smoke', Digit6: 'slot6', KeyQ: 'lastweapon' };

  function onKey(e, down) {
    if (e.code === 'Space') e.preventDefault();
    if (down && !e.repeat) {
      if (e.code === 'KeyR') state.actions.push('reload');
      else if (e.code === 'KeyB') state.actions.push('buy');
      else if (SLOT_KEYS[e.code]) state.actions.push(SLOT_KEYS[e.code]);
    }
    if (down) state.keys.add(e.code);
    else state.keys.delete(e.code);
  }

  document.addEventListener('keydown', (e) => onKey(e, true));
  document.addEventListener('keyup', (e) => onKey(e, false));
  document.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.lookX += e.movementX;
    state.lookY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.aiming = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.aiming = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { state.firing = false; state.aiming = false; }
    onLockChange(state.locked);
  });
  window.addEventListener('blur', () => { state.keys.clear(); state.firing = false; state.aiming = false; });

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    takeLook() {
      const out = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return out;
    },
    drainActions() {
      const out = state.actions;
      state.actions = [];
      return out;
    },
  };
}
