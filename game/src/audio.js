// Synthesized sound: every effect is built from oscillators and filtered
// noise at runtime, so the game ships no audio files. The context starts on
// the first user gesture; before that every call is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }
  function noise(dur, freq, gain, when = 0, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  function tone(freq, dur, gain, type = 'sine', slide = 0, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  // distance in metres; the player's own shots pass 0 (full volume).
  function atten(dist) {
    return Math.max(0.05, 1 - dist / 60);
  }
  const PITCH = { pistol: 900, smg: 1100, rifle: 700, sniper: 420 };
  return {
    unlock() { ensure(); },
    shot(key, dist = 0, own = true) {
      if (!ensure()) return;
      const v = own ? 1 : atten(dist);
      noise(0.12, PITCH[key] || 800, 0.5 * v);
      tone(120, 0.09, 0.4 * v, 'sine', -60);
    },
    dry() { if (ensure()) tone(1800, 0.05, 0.15, 'square'); },
    reload() {
      if (!ensure()) return;
      tone(900, 0.05, 0.2, 'square');
      tone(650, 0.05, 0.2, 'square', 0, 0.18);
    },
    hit(head) { if (ensure()) tone(head ? 2400 : 1600, 0.06, 0.25, 'square'); },
    kill() { if (ensure()) { tone(1200, 0.07, 0.2, 'square'); tone(1800, 0.09, 0.2, 'square', 0, 0.07); } },
    explosion(dist = 0) {
      if (!ensure()) return;
      const v = atten(dist);
      noise(1.1, 300, 0.9 * v);
      tone(70, 0.9, 0.7 * v, 'sine', -40);
    },
    smokePop() { if (ensure()) noise(0.25, 500, 0.3); },
    throwPin() { if (ensure()) tone(1400, 0.04, 0.15, 'square'); },
    beep(fast) { if (ensure()) tone(fast ? 1600 : 1100, 0.09, 0.3, 'square'); },
    plant() { if (ensure()) { tone(880, 0.12, 0.3, 'square'); tone(1320, 0.16, 0.3, 'square', 0, 0.12); } },
    roundWin() {
      if (!ensure()) return;
      [523, 659, 784].forEach((f, i) => tone(f, 0.16, 0.25, 'triangle', 0, i * 0.11));
    },
    roundLose() {
      if (!ensure()) return;
      [392, 311].forEach((f, i) => tone(f, 0.22, 0.25, 'triangle', 0, i * 0.16));
    },
    buy() { if (ensure()) { tone(1500, 0.05, 0.2, 'square'); tone(2000, 0.07, 0.2, 'square', 0, 0.06); } },
    step() { if (ensure()) noise(0.05, 400, 0.06); },
  };
}
